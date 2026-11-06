# Contrato JSON

## Entrada

O subworkflow recebe exatamente um item JSON por execução.

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `content_id` | string ou número | não | É convertido para string; `null` quando ausente. |
| `tipo_conteudo` | string | não | Padrão: `texto`. |
| `idioma_origem` | string | sim | Código suportado pelo modelo; variantes como `pt-BR` são reduzidas para `pt`. |
| `idioma_destino` | string | sim | Código suportado pelo modelo. |
| `texto_original` | string | sim | Não pode ser vazio. |
| `instrucoes_traducao` | string | não | Deve estar ausente ou vazia neste piloto especializado. |

Idiomas habilitados conforme o catálogo do modelo consultado em 29/10/2026:
`ar`, `de`, `en`, `es`, `fr`, `hi`, `ja`, `pt`, `ru` e `zh`.

## Saída de sucesso

```json
{
  "content_id": "piloto-001",
  "status": "success",
  "tipo_conteudo": "artigo",
  "idioma_origem": "pt",
  "idioma_destino": "en",
  "texto_traduzido": "The government announced a new energy policy.",
  "modelo": "@cf/meta/m2m100-1.2b",
  "metricas": {
    "tentativas": 1,
    "caracteres_entrada": 51,
    "caracteres_saida": 45,
    "consumo_cloudflare": null
  }
}
```

`consumo_cloudflare` preserva métricas fornecidas pela API quando disponíveis.
O workflow não inventa uma medição quando a resposta não traz esse dado.

## Saída de erro

```json
{
  "content_id": "piloto-001",
  "status": "error",
  "tipo_conteudo": "artigo",
  "idioma_origem": "pt",
  "idioma_destino": "en",
  "texto_traduzido": null,
  "modelo": "@cf/meta/m2m100-1.2b",
  "erro": {
    "codigo": "LIMIT_EXCEEDED",
    "categoria": "quota_or_rate_limit",
    "diagnostico": "Limite de uso atingido.",
    "http_status": 429,
    "tentativas": 1,
    "esgotou_tentativas": false
  }
}
```

Erros HTTP `401`, `403`, `404` e `429` não são repetidos. Falhas de rede,
timeout e HTTP `425`, `500`, `502`, `503` e `504` recebem no máximo três
tentativas com backoff de 2 e 4 segundos.

O texto original não é incluído na saída nem nos diagnósticos normalizados.
