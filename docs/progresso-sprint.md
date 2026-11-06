# Progresso da sprint

Última atualização: 29/10/2026 — horário de São Paulo.

## Objetivo

Validar um piloto isolado de tradução editorial integrado ao n8n, usando a
API REST do Cloudflare Workers AI e priorizando a franquia gratuita. O piloto
não substitui os fluxos Gemini existentes e não modifica componentes de RSS.

## Estado do repositório

- Repositório: `ppiressolucoes/Fluxo-M360-LLM-AI-Cloudflare-Textual`.
- Checkout: `/workspace/Fluxo-M360-LLM-AI-Cloudflare-Textual`.
- Branch local de trabalho: `work`.
- Commit base: `94f509d9f9d19c2ba766e7b8b4af993bbdb809e4`.
- Leitura do remoto `origin` confirmada com `git ls-remote`.
- O remoto e o checkout local apontavam para o mesmo commit no teste.
- As alterações descritas abaixo estão somente no workspace: ainda não foram
  commitadas nem enviadas ao GitHub.
- Permissão de push não foi testada, pois nenhum push foi solicitado.

## Concluído

### Pesquisa técnica

- Catálogo, contrato do modelo, preços e limites foram conferidos na fonte
  oficial da documentação Cloudflare em 29/10/2026.
- Modelo inicial escolhido: `@cf/meta/m2m100-1.2b`.
- Arquitetura escolhida: chamada REST direta do n8n para o Workers AI, sem
  Worker intermediário.
- A franquia documentada é de 10.000 Neurons por dia por conta, reiniciada às
  00:00 UTC.

### Implementação local

- Workflow n8n isolado e inicialmente inativo.
- Validação de entrada e normalização de idiomas.
- Contrato previsível de sucesso e erro.
- Autenticação referenciada por credencial Header Auth do n8n.
- Timeout de 30 segundos.
- Até três tentativas apenas para falhas transitórias.
- Erros de autenticação, modelo inexistente e limite de uso não são repetidos.
- Diagnósticos são sanitizados e o texto original não é devolvido na saída.
- O piloto rejeita instruções editoriais livres, pois o modelo especializado
  não possui esse recurso.

### Validação

- 28 testes locais aprovados.
- JSON do workflow validado.
- Fonte e artefato exportado sincronizados.
- Importação real concluída com sucesso no n8n 2.45.6 em ambiente temporário.
- Nenhum token Cloudflare foi salvo no repositório.

### Piloto Groq com banco

- Integração preparada para `CALL sp_get_api('groq')`.
- O contrato do fluxo pai usa `Titulo`, `Conteúdo`, `Legenda_IMG`,
  `MSG_Prompt_User` e `MSG_Prompt_System`.
- Título, fragmentos HTML de até 2.500 caracteres e legenda tornam-se tarefas
  independentes, processadas sequencialmente pelo node `Loop de Tarefas`.
- Cada tarefa exige `finish_reason = stop` e marcador final determinístico.
- O node `Montar JSON Final` produz exatamente `idioma`, `titulo_en`,
  `conteudo_en` e `legenda_imagem_en`.
- Respostas truncadas ou tarefas ausentes não são aceitas.
- A agregação rejeita o uso de modelos diferentes no mesmo artigo.
- O workflow Groq foi importado com sucesso no n8n 2.45.6 em ambiente
  temporário, sem conexão com o banco ou com contas reais.
- A cópia versionada de `sp_get_api` não contém `DEFINER` nem credenciais.

### Configuração acompanhada com o usuário

- O usuário confirmou que já possui Account ID e token do Workers AI REST.
- A conta inicialmente observada estava próxima do limite diário da franquia.
- O usuário decidiu verificar outra conta com saldo de franquia disponível.
- Foi orientada a criação de uma credencial n8n do tipo Header Auth chamada
  `Cloudflare Workers AI Bearer - Piloto`.

## Pendente

1. Confirmar uma conta Cloudflare com franquia disponível.
2. Confirmar se o n8n é Cloud ou self-hosted.
3. Configurar o Account ID de acordo com o tipo de implantação do n8n.
4. Criar ou selecionar a credencial Header Auth no node HTTP.
5. Importar o workflow no ambiente n8n de homologação.
6. Vincular a credencial MySQL ao node `SP Selecionar API Groq`.
7. Atualizar o fluxo publicado com a versão Cross Account do artefato.
8. Confirmar que todas as linhas `groq` ativas usam o mesmo modelo no lote.
9. Executar a primeira chamada real pelo fluxo pai.
10. Avaliar tradução real com amostra editorial representativa.
11. Registrar latência, qualidade, `finish_reason` e consumo observado.
12. Implementar subdivisão recursiva e failover após o benchmark inicial.
13. Decidir entre continuar com o modelo especializado ou criar uma variante
    generativa para instruções editoriais.

## Bloqueios atuais

- Não há credenciais Cloudflare disponíveis neste workspace, e elas não devem
  ser enviadas pelo chat nem gravadas no repositório.
- Ainda não foi informado se a instância n8n é Cloud ou self-hosted; essa
  informação define como o Account ID será fornecido ao workflow.
- A homologação real depende de saldo na franquia Workers AI.

## Observação de segurança

O workflow Gemini fornecido como referência continha uma credencial escrita
diretamente em um header. Esse valor não foi copiado para o projeto. A chave
exposta deve ser revogada ou rotacionada antes de reutilizar ou compartilhar
o workflow original.

## Próximo passo

Após a escolha da conta Cloudflare, confirmar apenas o tipo de implantação do
n8n (`Cloud` ou `self-hosted`). Em seguida, configurar o Account ID e revisar
o node `Entrada M360` e o node `Validar e Preparar`.
