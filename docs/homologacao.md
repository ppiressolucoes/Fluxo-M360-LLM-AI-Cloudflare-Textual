# Plano e estado da homologação

## Estado atual

| Critério | Estado | Evidência ou pendência |
| --- | --- | --- |
| Contrato de entrada e saída | Implementado | Testes unitários e `docs/contrato-json.md`. |
| Workflow n8n isolado | Implementado | Artefato importável, inicialmente inativo. |
| Importação no n8n | Verificada | Importação concluída no n8n 2.45.6 em ambiente temporário. |
| Segredo fora do código | Implementado | Header Auth referenciado apenas pelo nome; teste antissegredo. |
| Erros e retries limitados | Implementado localmente | Testes cobrem autenticação, limite e falhas transitórias. |
| Chamada autenticada | Pendente | Requer Account ID, credencial segura e execução em uma instância n8n. |
| Tradução real | Pendente | Requer a chamada autenticada. |
| Avaliação linguística | Pendente | Requer amostra editorial e revisão humana. |
| Consumo real | Pendente | Requer execução e leitura do dashboard Workers AI. |
| Compatibilidade com fluxo pai | Pendente | Requer importação e teste no n8n de homologação. |

## Matriz mínima de avaliação editorial

Executar pelo menos os seguintes casos em `pt -> en`, `en -> pt` e nos demais
pares efetivamente usados pelo Core:

1. Título curto com nome próprio.
2. Artigo com pelo menos cinco parágrafos.
3. Datas, moedas, percentuais e unidades de medida.
4. Citação direta e indireta.
5. Siglas, nomes de empresas e localidades.
6. Legenda curta com pontuação incomum.
7. Texto com HTML ou Markdown, se esse formato for necessário no fluxo pai.

Para cada caso, registrar o resultado real, revisão humana, erros factuais,
perda de estrutura, latência e consumo observado. Não marcar o piloto como
homologado somente porque a API respondeu com HTTP 200.

## Decisão após os testes

- **Continuar** se significado, nomes, números e citações forem preservados e
  o volume couber na franquia ou no orçamento aprovado.
- **Ajustar** com variante generativa se a tradução literal funcionar, mas
  regras editoriais forem indispensáveis.
- **Abandonar** se a qualidade ou previsibilidade forem inadequadas mesmo em
  textos representativos.
