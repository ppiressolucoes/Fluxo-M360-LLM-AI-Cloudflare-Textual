# Piloto Groq com seleção de API pelo banco

## Objetivo

Usar a tabela `Config_API_IA` e `sp_get_api('groq')` para selecionar uma das
contas Groq aprovadas, traduzindo o conteúdo em blocos e recusando qualquer
resultado parcial.

O piloto não executa migrações, não insere credenciais e não altera a
procedure no banco. A cópia em `sql/sp_get_api.sql` foi sanitizada, teve o
`DEFINER` removido e serve somente como contrato versionado.

## Contrato dos registros Groq

| Campo | Uso no piloto |
| --- | --- |
| `dsc_plataforma` | Deve ser `groq`. |
| `dsc_url_servico` | ID exato do modelo, por exemplo `openai/gpt-oss-20b`. |
| `dsc_api_key` | Chave Groq usada apenas no header HTTP. |
| `ind_ativo` | `1` para participar da seleção. |
| `dth_acesso` | Ordenação da conta utilizada há mais tempo. |
| `dth_bloqueio_ate` | Reserva temporária da conta. |
| `dsc_status` | Diagnóstico operacional resumido. |

Todas as linhas ativas usadas por uma execução devem apontar para o mesmo
modelo. O agregador rejeita o artigo se detectar modelos diferentes entre os
blocos. Para comparar modelos, execute lotes separados ou evolua a procedure
para receber também o modelo desejado.

## Fragmentação

- A entrada recebe `Titulo`, `Conteúdo`, `Legenda_IMG`, `MSG_Prompt_User` e
  `MSG_Prompt_System` do fluxo pai.
- O título e a legenda são tarefas próprias; o HTML é dividido em fragmentos
  de no máximo 2.500 caracteres para reduzir o risco de supressão em modelos
  com menor capacidade efetiva de saída.
- O corte prioriza fechamentos de tags de bloco, parágrafos, linhas, frases e
  espaços.
- Links para `energialimpa.live` e o widget `NOTÍCIAS RELACIONADAS` são
  removidos deterministicamente antes da tradução.
- Cada tarefa recebe índice, total e marcador final determinístico.
- O artigo só é concluído quando todas as tarefas retornam com
  `finish_reason = stop` e o marcador esperado.
- `finish_reason = length` nunca é aceito como sucesso.

O prompt de sistema recebido é usado como política editorial somente até a
regra 10. As exigências de JSON a partir da regra 11 não são enviadas às
chamadas parciais, pois fariam cada fragmento tentar produzir um documento
completo. O node `Montar JSON Final` constrói, sem uma chamada adicional à IA,
exatamente:

```json
{
  "idioma": "en-US",
  "titulo_en": "...",
  "conteudo_en": "<p>...</p>",
  "legenda_imagem_en": "..."
}
```

`MSG_Prompt_User` é validado como parte do contrato, mas não é reenviado à
Groq, porque contém novamente o artigo completo. Os campos estruturados são a
fonte preferencial das tarefas e evitam duplicar tokens em cada fragmento. Para
compatibilidade com o fluxo pai observado, se esses campos não existirem o
node extrai `- Título:`, `- Contexto:` e `- Legenda:` do próprio prompt.

O piloto retorna erro quando um bloco precisa ser subdividido. A subdivisão
recursiva e o failover automático de credencial são o próximo incremento,
depois de medir os modelos com artigos reais.

O workflow piloto foi importado com sucesso no n8n 2.45.6 em uma instância
temporária. Essa validação confirma a estrutura do artefato, mas não comprova
conexão com o MySQL nem execução autenticada no Groq.

## Observações sobre a procedure atual

1. O comentário original menciona reserva de dois minutos, mas o SQL reserva
   a linha por dez segundos.
2. A coluna `num_count` não é incrementada nem retornada.
3. `SKIP LOCKED` exige uma versão de MySQL/MariaDB que ofereça esse recurso.
4. O retorno contém `dsc_api_key`; portanto, a chave aparece nos dados
   intermediários da execução n8n. Para produção, desabilite a retenção de
   execuções bem-sucedidas ou use um broker/credential resolver que não
   exponha a chave nos itens do workflow.
5. `dsc_email_cad` e `dsc_api_secret` também são retornados, mas não são usados
   pelo piloto. Uma versão futura da SP deve omitir campos desnecessários.
6. O pool de contas só deve ser usado de acordo com os termos do Groq; a
   implementação não deve servir para contornar limites contratuais.

## Critérios do piloto

- Selecionar uma conta com `CALL sp_get_api('groq')`.
- Processar título, blocos HTML e legenda sequencialmente.
- Não registrar ou devolver a chave.
- Rejeitar resposta vazia, truncada ou sem marcador.
- Preservar a ordem dos blocos.
- Montar o JSON final com somente os quatro campos editoriais exigidos.
- Não aceitar artigo parcialmente traduzido.

## Contrato do fluxo pai

Exemplo mínimo de item enviado pelo node `Execute Sub-workflow`:

```json
{
  "content_id": "noticia-123",
  "Titulo": "Brasil amplia geração solar",
  "Conteúdo": "<p>Conteúdo em português.</p>",
  "Legenda_IMG": "Parque solar. Foto: Divulgação",
  "MSG_Prompt_User": "Prompt editorial já renderizado pelo fluxo pai.",
  "MSG_Prompt_System": "Política editorial e formato de saída informados pelo fluxo pai."
}
```

A legenda pode ser uma string vazia. `MSG_Prompt_User` e `MSG_Prompt_System`
são obrigatórios. Título e conteúdo podem chegar nos campos estruturados ou
nas seções correspondentes do prompt; os campos separados continuam sendo o
formato recomendado. `content_id` é opcional e aparece apenas em retornos de
erro.
