import { MAX_ATTEMPTS, MODEL, SUPPORTED_LANGUAGES } from "./core.mjs";

const validationCode = `
const input = $input.first()?.json;
const supported = ${JSON.stringify(SUPPORTED_LANGUAGES)};
const normalizeLanguage = value => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return supported.includes(normalized) ? normalized : null;
};
const errors = [];
if (!input || typeof input !== 'object' || Array.isArray(input)) {
  errors.push({ field: '$', code: 'INVALID_INPUT', message: 'A entrada deve ser um objeto JSON.' });
}
const text = typeof input?.texto_original === 'string' ? input.texto_original.trim() : '';
const source = normalizeLanguage(input?.idioma_origem);
const target = normalizeLanguage(input?.idioma_destino);
if (!text) errors.push({ field: 'texto_original', code: 'REQUIRED_FIELD', message: 'texto_original deve ser uma string não vazia.' });
if (!source) errors.push({ field: 'idioma_origem', code: 'UNSUPPORTED_LANGUAGE', message: 'Código de idioma de origem não suportado pelo piloto.' });
if (!target) errors.push({ field: 'idioma_destino', code: 'UNSUPPORTED_LANGUAGE', message: 'Código de idioma de destino não suportado pelo piloto.' });
if (input?.instrucoes_traducao != null && String(input.instrucoes_traducao).trim()) {
  errors.push({ field: 'instrucoes_traducao', code: 'UNSUPPORTED_INSTRUCTIONS', message: 'O modelo especializado do piloto não aceita instruções editoriais livres.' });
}
if (input?.content_id != null && !['string', 'number'].includes(typeof input.content_id)) {
  errors.push({ field: 'content_id', code: 'INVALID_FIELD', message: 'content_id deve ser string ou número quando informado.' });
}
const accountId = String($env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
if (!accountId) errors.push({ field: 'CLOUDFLARE_ACCOUNT_ID', code: 'MISSING_CONFIGURATION', message: 'CLOUDFLARE_ACCOUNT_ID não está configurado no ambiente do n8n.' });
if (errors.length) {
  return [{ json: {
    _route: 'error',
    content_id: input?.content_id == null ? null : String(input.content_id),
    status: 'error',
    texto_traduzido: null,
    modelo: '${MODEL}',
    erro: { codigo: 'INVALID_INPUT', categoria: 'validation', diagnostico: 'Entrada ou configuração inválida.', detalhes: errors, http_status: null, tentativas: 0, esgotou_tentativas: false }
  }}];
}
return [{ json: {
  _route: 'request',
  contexto: {
    content_id: input.content_id == null ? null : String(input.content_id),
    tipo_conteudo: typeof input.tipo_conteudo === 'string' && input.tipo_conteudo.trim() ? input.tipo_conteudo.trim() : 'texto',
    idioma_origem: source,
    idioma_destino: target,
    texto_original: text,
    account_id: accountId,
    modelo: '${MODEL}',
    request_body: { text, source_lang: source, target_lang: target },
    _core: { tentativa: 1, max_tentativas: ${MAX_ATTEMPTS} }
  }
}}];`;

const interpretationCode = `
let context = $('Validar e Preparar').first().json.contexto;
try {
  const retryContext = $('Incrementar Tentativa').last().json.contexto;
  if (retryContext) context = retryContext;
} catch {}
const response = $json ?? {};
const statusCode = Number(response.statusCode ?? 0);
const body = response.body ?? response;
const translated = body?.result?.translated_text;
const sanitize = value => String(value ?? 'Erro não detalhado.')
  .replace(/Bearer\\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
  .replace(/(?:token|api[_ -]?key|authorization)\\s*[:=]\\s*[^\\s,;]+/gi, '[CREDENCIAL REDACTED]')
  .replace(/\\s+/g, ' ').trim().slice(0, 500);
const message = fallback => {
  const candidate = Array.isArray(body?.errors) ? body.errors[0] : body?.error;
  return sanitize(candidate?.message ?? candidate ?? body?.message ?? fallback);
};
if (statusCode >= 200 && statusCode < 300 && body?.success !== false && typeof translated === 'string' && translated.trim()) {
  return [{ json: { _route: 'success', contexto: context, translated_text: translated.trim(), usage: body?.result?.usage ?? body?.usage ?? null, status_code: statusCode } }];
}
let error;
if (statusCode >= 200 && statusCode < 300) error = { code: 'EMPTY_OR_INVALID_RESPONSE', category: 'response', retryable: true, diagnostic: 'A resposta não contém result.translated_text válido.' };
else if ([401, 403].includes(statusCode)) error = { code: 'AUTHENTICATION_FAILED', category: 'authentication', retryable: false, diagnostic: message('Autenticação recusada pela Cloudflare.') };
else if (statusCode === 404) error = { code: 'MODEL_UNAVAILABLE', category: 'model', retryable: false, diagnostic: message('Modelo ou endpoint não encontrado.') };
else if (statusCode === 429) error = { code: 'LIMIT_EXCEEDED', category: 'quota_or_rate_limit', retryable: false, diagnostic: message('Limite de uso atingido.') };
else if ([408, 425, 500, 502, 503, 504].includes(statusCode)) error = { code: statusCode === 408 ? 'TIMEOUT' : 'UPSTREAM_UNAVAILABLE', category: statusCode === 408 ? 'timeout' : 'upstream', retryable: true, diagnostic: message('Falha transitória na Cloudflare.') };
else if (statusCode >= 400) error = { code: 'CLOUDFLARE_API_ERROR', category: 'api', retryable: false, diagnostic: message('Erro retornado pela API da Cloudflare.') };
else error = { code: 'NETWORK_ERROR', category: 'communication', retryable: true, diagnostic: message('Falha de comunicação com a Cloudflare.') };
const attempt = Number(context._core?.tentativa ?? 1);
const maxAttempts = Number(context._core?.max_tentativas ?? ${MAX_ATTEMPTS});
const mayRetry = error.retryable && attempt < maxAttempts;
return [{ json: {
  _route: mayRetry ? 'retry' : 'error',
  contexto: context,
  ...error,
  exhausted: error.retryable && !mayRetry,
  status_code: statusCode || null,
  retry_delay_seconds: mayRetry ? Math.min(2 ** attempt, 10) : null
}}];`;

const incrementCode = `
const item = $input.first().json;
const context = item.contexto;
return [{ json: {
  _route: 'request',
  contexto: {
    ...context,
    _core: { ...context._core, tentativa: Number(context._core.tentativa) + 1 }
  }
}}];`;

const successCode = `
const item = $input.first().json;
const context = item.contexto;
return [{ json: {
  content_id: context.content_id,
  status: 'success',
  tipo_conteudo: context.tipo_conteudo,
  idioma_origem: context.idioma_origem,
  idioma_destino: context.idioma_destino,
  texto_traduzido: item.translated_text,
  modelo: context.modelo,
  metricas: {
    tentativas: context._core.tentativa,
    caracteres_entrada: context.texto_original.length,
    caracteres_saida: item.translated_text.length,
    consumo_cloudflare: item.usage
  }
}}];`;

const errorCode = `
const item = $input.first().json;
if (!item.contexto) return [{ json: Object.fromEntries(Object.entries(item).filter(([key]) => key !== '_route')) }];
const context = item.contexto;
return [{ json: {
  content_id: context.content_id,
  status: 'error',
  tipo_conteudo: context.tipo_conteudo,
  idioma_origem: context.idioma_origem,
  idioma_destino: context.idioma_destino,
  texto_traduzido: null,
  modelo: context.modelo,
  erro: {
    codigo: item.code,
    categoria: item.category,
    diagnostico: item.diagnostic,
    http_status: item.status_code ?? null,
    tentativas: context._core.tentativa,
    esgotou_tentativas: Boolean(item.exhausted)
  }
}}];`;

const stringEquals = (leftValue, rightValue, id) => ({
  options: {
    caseSensitive: true,
    leftValue: "",
    typeValidation: "strict",
    version: 2,
  },
  conditions: [
    {
      id,
      leftValue,
      rightValue,
      operator: { type: "string", operation: "equals" },
    },
  ],
  combinator: "and",
});

export function createWorkflow() {
  return {
    name: "Fluxo M360 | LLM AI Cloudflare Textual",
    nodes: [
      {
        parameters: { inputSource: "passthrough" },
        id: "b1743583-2345-45cc-8de4-e95944fc4001",
        name: "Entrada M360",
        type: "n8n-nodes-base.executeWorkflowTrigger",
        typeVersion: 1.2,
        position: [-980, 0],
      },
      {
        parameters: { jsCode: validationCode },
        id: "0e857f40-1f84-438d-845c-7923737b4002",
        name: "Validar e Preparar",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [-760, 0],
      },
      {
        parameters: {
          conditions: stringEquals(
            "={{ $json._route }}",
            "request",
            "bd195bbc-806c-4907-a038-acde611a4003",
          ),
        },
        id: "7104d8c8-d072-4a81-952c-afd4eec74004",
        name: "Entrada Valida?",
        type: "n8n-nodes-base.if",
        typeVersion: 2.2,
        position: [-540, 0],
      },
      {
        parameters: {
          method: "POST",
          url: "={{ 'https://api.cloudflare.com/client/v4/accounts/' + $json.contexto.account_id + '/ai/run/' + $json.contexto.modelo }}",
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              { name: "Content-Type", value: "application/json" },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={{ $json.contexto.request_body }}",
          options: {
            response: {
              response: {
                fullResponse: true,
                neverError: true,
                responseFormat: "json",
              },
            },
            timeout: 30000,
          },
        },
        id: "85aa24ef-adad-47bd-ae6d-87a405e44005",
        name: "Cloudflare Workers AI",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.5,
        position: [-300, -120],
        credentials: {
          httpHeaderAuth: { name: "Cloudflare Workers AI Bearer" },
        },
        onError: "continueRegularOutput",
      },
      {
        parameters: { jsCode: interpretationCode },
        id: "54089327-a0a1-430d-8170-45cbe9df4006",
        name: "Interpretar Resposta",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [-60, -120],
      },
      {
        parameters: {
          conditions: stringEquals(
            "={{ $json._route }}",
            "success",
            "15b22bac-a69d-479c-bc06-bff03c9c4007",
          ),
        },
        id: "3fe5a0d6-87ae-4456-8184-4920d5b34008",
        name: "Sucesso?",
        type: "n8n-nodes-base.if",
        typeVersion: 2.2,
        position: [180, -120],
      },
      {
        parameters: { jsCode: successCode },
        id: "07d48035-2b6a-438d-9605-39d851f34009",
        name: "Normalizar Sucesso",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [660, -240],
      },
      {
        parameters: {
          conditions: stringEquals(
            "={{ $json._route }}",
            "retry",
            "72f2c6e0-8ff4-4a53-9ef3-83b17e0d4010",
          ),
        },
        id: "dfc5dcb8-3d7a-4e68-8fc7-fe5967a04011",
        name: "Pode Repetir?",
        type: "n8n-nodes-base.if",
        typeVersion: 2.2,
        position: [420, 0],
      },
      {
        parameters: {
          amount: "={{ $json.retry_delay_seconds }}",
          unit: "seconds",
        },
        id: "17925a06-3489-42ce-921f-28a5aaea4012",
        name: "Aguardar Backoff",
        type: "n8n-nodes-base.wait",
        typeVersion: 1.1,
        position: [660, -40],
        webhookId: "0ce8ff7d-fcac-4f80-8207-9b58070c4013",
      },
      {
        parameters: { jsCode: incrementCode },
        id: "09deef46-1ecb-48f4-aae6-3e46dd8a4014",
        name: "Incrementar Tentativa",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [900, -40],
      },
      {
        parameters: { jsCode: errorCode },
        id: "3153aa76-0efb-40ba-b62d-0be0b86c4015",
        name: "Normalizar Erro",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [660, 160],
      },
    ],
    connections: {
      "Entrada M360": {
        main: [[{ node: "Validar e Preparar", type: "main", index: 0 }]],
      },
      "Validar e Preparar": {
        main: [[{ node: "Entrada Valida?", type: "main", index: 0 }]],
      },
      "Entrada Valida?": {
        main: [
          [{ node: "Cloudflare Workers AI", type: "main", index: 0 }],
          [{ node: "Normalizar Erro", type: "main", index: 0 }],
        ],
      },
      "Cloudflare Workers AI": {
        main: [[{ node: "Interpretar Resposta", type: "main", index: 0 }]],
      },
      "Interpretar Resposta": {
        main: [[{ node: "Sucesso?", type: "main", index: 0 }]],
      },
      "Sucesso?": {
        main: [
          [{ node: "Normalizar Sucesso", type: "main", index: 0 }],
          [{ node: "Pode Repetir?", type: "main", index: 0 }],
        ],
      },
      "Pode Repetir?": {
        main: [
          [{ node: "Aguardar Backoff", type: "main", index: 0 }],
          [{ node: "Normalizar Erro", type: "main", index: 0 }],
        ],
      },
      "Aguardar Backoff": {
        main: [[{ node: "Incrementar Tentativa", type: "main", index: 0 }]],
      },
      "Incrementar Tentativa": {
        main: [[{ node: "Cloudflare Workers AI", type: "main", index: 0 }]],
      },
    },
    pinData: {},
    settings: { executionOrder: "v1" },
    active: false,
    versionId: "ee204065-a280-4056-a31e-1fd25d184016",
    meta: { templateCredsSetupCompleted: false },
    tags: [],
  };
}
