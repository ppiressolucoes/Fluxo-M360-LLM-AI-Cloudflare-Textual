import { createWorkflow } from './workflow.mjs';

export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export function createImagePromptWorkflow() {
  const workflow = createWorkflow();
  workflow.name = 'M360 | Cloudflare Workers AI | Prompt de Imagem';
  // Fixed identifiers keep the exported artifact reproducible.
  workflow.versionId = '4e67944c-13c8-4b64-9850-7a4038325301';
  const get = name => workflow.nodes.find(node => node.name === name);
  get('Aguardar Backoff').webhookId = 'ddc03d88-a446-4cf5-9c00-e37af2d01318';
  get('Validar e Preparar').parameters.jsCode = `
const input = $input.first()?.json ?? {};
const system = typeof input.MSG_Prompt_System === 'string' ? input.MSG_Prompt_System.trim() : '';
const user = typeof input.MSG_Prompt_User === 'string' ? input.MSG_Prompt_User.trim() : '';
if (!system || !user) throw new Error('CORE Cloudflare: MSG_Prompt_System e MSG_Prompt_User são obrigatórios.');
const accountId = String($env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error('CORE Cloudflare: CLOUDFLARE_ACCOUNT_ID ausente ou inválido.');
return [{ json: { _route: 'request', contexto: {
  account_id: accountId, modelo: '${MODEL}',
  request_body: { messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 1024, stream: false },
  _core: { tentativa: 1, max_tentativas: 3 }
} } }];`;
  get('Interpretar Resposta').parameters.jsCode = `
let context = $('Validar e Preparar').first().json.contexto;
try { const retry = $('Incrementar Tentativa').last().json.contexto; if (retry) context = retry; } catch {}
const response = $json ?? {};
const status = Number(response.statusCode ?? 0);
const body = response.body ?? response;
const result = body?.result;
const text = typeof result?.response === 'string' ? result.response.trim() : '';
if (status >= 200 && status < 300 && body?.success !== false && text) {
  return [{ json: { _route: 'success', contexto: context, text, usage: result?.usage ?? null } }];
}
const transient = !status || [408, 425, 500, 502, 503, 504].includes(status);
const attempt = Number(context._core.tentativa);
const retry = transient && attempt < Number(context._core.max_tentativas);
const code = status === 429 ? 'LIMIT_EXCEEDED' : [401, 403].includes(status) ? 'AUTHENTICATION_FAILED' : status === 404 ? 'MODEL_UNAVAILABLE' : status >= 200 && status < 300 ? 'INVALID_RESPONSE' : transient ? 'COMMUNICATION_ERROR' : 'API_ERROR';
return [{ json: { _route: retry ? 'retry' : 'error', contexto: context, code, status_code: status || null, retry_delay_seconds: retry ? Math.min(2 ** attempt, 10) : null } }];`;
  get('Normalizar Sucesso').parameters.jsCode = `
const item = $input.first().json;
return [{ json: { text: item.text, modelo: item.contexto.modelo, tokens: item.usage?.total_tokens ?? null } }];`;
  get('Normalizar Erro').parameters.jsCode = `
const item = $input.first().json;
throw new Error('CORE Cloudflare: ' + (item.code ?? 'INVALID_INPUT') + ' (HTTP ' + (item.status_code ?? 'indisponível') + ').');`;
  return workflow;
}
