# Subfluxo Cloudflare para prompt de imagem

Este piloto gera **texto para um prompt de imagem**, não gera a imagem. O nó `Agent LLM CMD` do fluxo pai `SUB3 - AI PROMPT DE IMG` já fornece `MSG_Prompt_System` e `MSG_Prompt_User`. O subfluxo recebe esses campos e retorna `text`, `modelo` e `tokens`, como o Core Gemini. Erros encerram a execução, para que uma mensagem de erro não seja utilizada como prompt.

O modelo inicial é `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, de geração de texto. A API REST aceita mensagens de sistema e usuário e retorna `result.response` e, quando disponível, `result.usage`: [documentação do modelo](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/). A escolha é uma hipótese para homologação editorial; qualidade, tempo e consumo dependem de testes reais. Consulte [preços e franquia](https://developers.cloudflare.com/workers-ai/platform/pricing/) antes de habilitar uso regular.

## Instalação e teste

1. Configure `CLOUDFLARE_ACCOUNT_ID` no ambiente do processo n8n. O acesso a `$env` no Code node deve estar habilitado na instalação. Se a implantação não permitir acesso a variáveis, adapte a configuração de forma segura antes da importação em produção.
2. Crie uma credencial n8n **Header Auth**, com nome do cabeçalho `Authorization` e valor `Bearer <TOKEN>`, com permissão Workers AI. Não coloque o token no JSON nem o envie pelo chat.
3. Importe `workflows/llm-core-cloudflare-prompt-imagem.json`, vincule a credencial no nó `Cloudflare Workers AI` e mantenha o fluxo inativo até homologação. O timeout é de 30 segundos; falhas de comunicação e HTTP 408, 425, 500, 502, 503 e 504 têm até três tentativas. Erros 429, autenticação, modelo e resposta vazia encerram a execução.
4. Em uma cópia de homologação do pai, troque o destino do nó `Chamada Gemini Cross` pelo novo subfluxo, mantendo os campos produzidos por `Agent LLM CMD` e aguardando a conclusão. Confirme no editor que os dois campos chegam ao trigger; se o mapeamento automático não ocorrer, mapeie ambos explicitamente. O pai original não foi alterado.
5. Execute casos representativos de tema e contexto. Verifique se `text` é uma única linha em inglês, descreve a cena editorial e respeita as restrições do pai; registre qualidade, latência e consumo. O retorno nativo documentado não fornece garantia de conclusão por `finish_reason`, portanto saída truncada exige avaliação na homologação.

A execução do n8n pode registrar entradas, saídas e dados de requisição conforme sua configuração de retenção; ajuste-a conforme a política do ambiente. O arquivo Gemini de referência contém um valor de chave de proxy embutido: trate-o como exposto, rotacione-o e remova-o das cópias compartilhadas.

Para regenerar e verificar o artefato: `node scripts/generate-image-prompt-workflow.mjs` e `node scripts/generate-image-prompt-workflow.mjs --check`. Testes: `node --test test/image-prompt-workflow.test.mjs`.
