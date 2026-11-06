# Decisão técnica

## Decisão

Usar `@cf/meta/m2m100-1.2b` na primeira prova de conceito e chamar a API REST
do Workers AI diretamente pelo n8n.

O modelo foi escolhido porque possui tarefa específica de tradução, contrato
simples (`text`, `source_lang`, `target_lang`) e saída explícita em
`translated_text`. Isso reduz a ambiguidade e o risco de texto adicional em
uma prova de conceito. O catálogo atual informa suporte a inglês, chinês,
francês, espanhol, árabe, russo, alemão, japonês, português e hindi.

Uma segunda variante com modelo generativo só deve ser criada se os testes
editoriais exigirem instruções de estilo, preservação estrutural avançada ou
saída enriquecida. O workflow especializado rejeita instruções livres para
que nenhuma regra editorial seja ignorada silenciosamente.

## API e autenticação

Endpoint:

```text
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/meta/m2m100-1.2b
```

O Account ID vem de `CLOUDFLARE_ACCOUNT_ID`. O token fica exclusivamente em
uma credencial Header Auth do n8n. O artefato exportado guarda somente a
referência nominal à credencial.

## Free Tier e estimativa inicial

Documentação oficial consultada em 29/10/2026, revisão do repositório de docs
Cloudflare `4750f69df0c60ce4d679c9b0681a82747f4ff49b`:

- Alocação gratuita: 10.000 Neurons por dia, com reinício às 00:00 UTC.
- Limite padrão da tarefa Translation: 720 requisições por minuto.
- `m2m100-1.2b`: 31.050 Neurons por milhão de tokens de entrada e o mesmo
  valor por milhão de tokens de saída.
- Acima da franquia gratuita, a documentação informa US$ 0,011 por 1.000
  Neurons no Workers Paid; o piloto não habilita faturamento.

Estimativa para uma amostra:

```text
neurons = 31.050 × (tokens_entrada + tokens_saida) / 1.000.000
```

Se a saída possuir aproximadamente a mesma quantidade de tokens da entrada,
10.000 Neurons representam cerca de 161 mil tokens de texto-fonte por dia.
Essa é apenas uma projeção: a homologação deve comparar a telemetria real do
dashboard com uma amostra editorial representativa.

## Limitações conhecidas

- O modelo especializado não aplica instruções editoriais livres.
- A API pode não devolver consumo por requisição; o workflow registra
  caracteres e preserva `usage` somente quando fornecido.
- Qualidade, nomes próprios, citações, datas e preservação de significado
  precisam de avaliação humana.
- O piloto não substitui Gemini, não participa da rotação de chaves e não
  modifica componentes de RSS.

## Fontes oficiais

- <https://developers.cloudflare.com/workers-ai/models/m2m100-1.2b/>
- <https://developers.cloudflare.com/workers-ai/get-started/rest-api/>
- <https://developers.cloudflare.com/workers-ai/platform/pricing/>
- <https://developers.cloudflare.com/workers-ai/platform/limits/>
