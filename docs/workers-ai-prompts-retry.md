# Tratamento de erros — Workers AI Prompts

Este documento descreve o fluxo `LLM IA Cloudflare | Workers AI Textual - Prompts` e o artefato inativo de homologação em `workflows/LLM IA Cloudflare _ Workers AI Textual - Prompts - HML Congelamento 1h.json`.

## Caminho de erro

1. `Interpretar Resposta` lê `statusCode`, o corpo de Workers AI e o código interno do provedor. Retorna `_route: retry` para falhas selecionadas enquanto houver tentativas; falhas finais retornam `_route: error`.
2. `Sucesso?` envia respostas válidas para `Normalizar Sucesso`. Respostas de erro seguem para `IF | Congela Chave?`.
3. O IF direciona HTTP 401, 403 e 429 para `Congela API`. Outras falhas elegíveis seguem sem congelamento. Após o UPDATE, `Restaura Erro` restaura o item que o MySQL substituiu.
4. `Pode Repetir?` envia `_route: retry` a `Aguardar Backoff`; os demais casos seguem para `Normalizar Erro` e `Stop and Error`.
5. `Aguardar Backoff` espera 11 segundos. `Incrementar Tentativa` avança o contador e retorna a `SP | Buscar API-KEY Cloudflare`, que seleciona a credencial para a próxima chamada.

## Congelamento temporário

O node MySQL `Congela API` atualiza a linha selecionada em `Config_API_IA`, correspondendo pelo `id`, definindo `dth_bloqueio_ate` para uma hora à frente e registrando o erro em `dsc_status`. O node precisa receber o ID da linha selecionada por `SP | Buscar API-KEY Cloudflare`; não use um ID fixo.

No erro observado, a Cloudflare respondeu HTTP 429 com código interno 4006 por esgotamento da alocação diária de Neurons. Esse limite é associado à conta Cloudflare. A rotação só pode continuar com sucesso se a SP selecionar outra conta com franquia disponível; trocar apenas o token da mesma conta não repõe a franquia. O congelamento no fluxo atual aplica-se à linha selecionada.

## Estado da homologação — 25/11/2026

- O usuário publicou o fluxo e confirmou uma execução bem-sucedida no caminho normal.
- O usuário confirmou que o congelamento temporário da linha de API foi atualizado.
- A próxima falha elegível deve confirmar, de ponta a ponta, o desvio congelamento → espera → SP → chamada com outra credencial. A execução bem-sucedida não percorre esse caminho.
- O artefato HML está inativo e não contém credenciais MySQL associadas. Antes de executá-lo, vincule os nodes MySQL a uma base de homologação.

## Segurança e operação

A operação altera a tabela `Config_API_IA`. Não execute a cópia HML com uma credencial de banco de produção. Os itens de execução carregam a credencial selecionada para compor o header HTTP; configure a retenção e o acesso às execuções n8n conforme a política do ambiente. Nunca versione tokens.
