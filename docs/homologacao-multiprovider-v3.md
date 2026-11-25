# Homologação — Core Multiprovider Textual v3.0

Registro de 25/11/2026, com base nos relatos e capturas de execução apresentados pelo usuário. O fluxo publicado foi ajustado diretamente no n8n; o export anterior à evolução não representa necessariamente a versão publicada.

## Regra homologada

1. Tentar Gemini até duas vezes por ciclo, buscando uma credencial pela SP e congelando a linha selecionada após falha.
2. Após duas falhas Gemini, emitir alerta e tentar Cloudflare uma vez.
3. Se a Cloudflare falhar, congelar a credencial Cloudflare e retornar à busca Gemini, reiniciando a contagem do ciclo.
4. Uma resposta bem-sucedida segue para `Normaliza Resposta LLM`.

## Evidências observadas

- **Sucesso na segunda chamada Gemini:** captura mostra duas execuções dos nodes de seleção e chamada Gemini, uma passagem por congelamento e contador e saída de sucesso; Cloudflare e alerta não foram executados.
- **Fallback Cloudflare na primeira chamada:** captura mostra duas chamadas Gemini com falha, um acionamento do alerta e uma chamada Cloudflare com sucesso. O resultado seguiu para `Normaliza Resposta LLM`.
- **Retorno após falha Cloudflare:** captura mostra quatro chamadas Gemini, dois acionamentos do fallback e duas chamadas Cloudflare. A primeira chamada Cloudflare seguiu por `IF RETRY` e `Congela API - Cloudflare`; a segunda chegou à saída de sucesso. O resultado apresentado identificou o provedor Cloudflare, modelo `@cf/meta/llama-3.3-70b-instruct-fp8-fast` e 1.624 tokens.

O usuário considerou a evolução homologada. Os totais observados são compatíveis com dois ciclos Gemini/Gemini/Cloudflare. As capturas não demonstram individualmente os IDs selecionados nem o valor de cada contador; a troca efetiva de credenciais e a associação dos congelamentos devem ser avaliadas nas saídas de cada iteração, sem expor credenciais.

## Acompanhamento

- A lógica atual permite voltar ao Gemini após falha Cloudflare; não foi confirmado um limite total de ciclos. Falhas persistentes em ambos os provedores podem prolongar a execução e repetir alertas.
- Não foi validada a qualidade factual do texto gerado em comparação com a fonte. A homologação relatada corresponde ao comportamento do fluxo.
- O export v3.1 fornecido posteriormente está em [cópia sanitizada e inativa](../workflows/llm-core-multiprovider-textual-v3.1-sanitizado.json). Foram removidos dados fixados, referências de credenciais, identificadores de workflow e destinatário; a chave literal do proxy foi substituída por um marcador. Antes de importar, configure as credenciais MySQL e Gmail, o destinatário e `X-Proxy-Key` por mecanismo seguro. A cópia é uma referência para homologação e não deve substituir diretamente o fluxo publicado.
- O limite diário de Neurons é por conta Cloudflare; tokens diferentes da mesma conta não fornecem franquia independente.
