# Fluxo M360 | LLM AI Cloudflare Textual

Piloto isolado de tradução editorial para o Core M360 usando a API REST do
Cloudflare Workers AI e o modelo especializado `@cf/meta/m2m100-1.2b`.

O projeto entrega um workflow n8n importável, contrato de entrada e saída,
tratamento de erros e uma suíte local que valida a lógica e impede a inclusão
acidental de credenciais no artefato exportado.

Além do piloto Cloudflare, o repositório contém um
[piloto Groq com rotação pelo banco](docs/piloto-groq-banco.md). Ele usa
`sp_get_api('groq')`, divide artigos em tarefas editoriais e recusa respostas
truncadas. O workflow Cross Account recebe título, HTML, legenda e os prompts
do fluxo pai, e monta o JSON final no próprio n8n.

## Arquitetura

```text
Fluxo editorial chamador
        |
        v
Execute Workflow Trigger (n8n)
        |
        v
Validação e preparação
        |
        v
Cloudflare Workers AI REST API
        |
        v
Classificação da resposta
   | sucesso | erro transitório | erro definitivo
   |         | retry limitado  |
   v         +------------------+
JSON normalizado
```

O piloto chama a API da Cloudflare diretamente. Ele não cria um Worker
intermediário, não acessa RSS e não altera os fluxos Gemini existentes.

## Pré-requisitos no n8n

1. Defina `CLOUDFLARE_ACCOUNT_ID` no ambiente do processo n8n.
2. Crie uma credencial n8n do tipo **Header Auth** com:
   - Name: `Authorization`
   - Value: `Bearer <TOKEN_CLOUDFLARE>`
3. Ao importar o workflow, associe essa credencial ao node
   `Cloudflare Workers AI`.
4. O token deve possuir as permissões `Workers AI - Read` e
   `Workers AI - Edit`, conforme a documentação oficial da Cloudflare.

Nunca inclua o token no JSON de entrada, no workflow exportado ou em arquivos
do repositório.

## Importação

Importe [o workflow](workflows/fluxo-m360-llm-ai-cloudflare-textual.json) no
n8n e selecione a credencial Header Auth no node HTTP. O workflow foi criado
como subworkflow e deve ser chamado com um item por execução.

Entrada mínima:

```json
{
  "content_id": "piloto-001",
  "tipo_conteudo": "artigo",
  "idioma_origem": "pt",
  "idioma_destino": "en",
  "texto_original": "O governo anunciou uma nova política energética."
}
```

O modelo especializado não aceita instruções editoriais livres. Para evitar
que uma regra seja silenciosamente ignorada, o piloto rejeita
`instrucoes_traducao` quando ela não está vazia. Uma variante generativa deve
ser avaliada separadamente antes de habilitar esse campo.

## Desenvolvimento e validação local

O projeto não possui dependências externas:

```bash
npm test
npm run workflow:check
npm run groq-workflow:check
```

O artefato foi validado por importação real no n8n `2.45.6`.

Para regenerar o JSON importável após uma alteração deliberada na definição:

```bash
npm run workflow:generate
npm run groq-workflow:generate
```

O artefato Groq atualizado para o contrato do fluxo pai está em
[workflows/llm-core-ai-cross-account-textual-piloto-groq.json](workflows/llm-core-ai-cross-account-textual-piloto-groq.json).

## Documentação

- [Decisão técnica e custos](docs/decisao-tecnica.md)
- [Contrato JSON](docs/contrato-json.md)
- [Plano e estado da homologação](docs/homologacao.md)
- [Progresso da sprint](docs/progresso-sprint.md)
- [Piloto Groq com seleção pelo banco](docs/piloto-groq-banco.md)
