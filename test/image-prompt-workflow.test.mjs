import test from 'node:test';
import assert from 'node:assert/strict';
import { createImagePromptWorkflow, MODEL } from '../src/image-prompt-workflow.mjs';

const workflow = createImagePromptWorkflow();
const node = name => workflow.nodes.find(n => n.name === name);
const run = (name, { input = {}, env = {}, json = {}, lookup = () => { throw Error('not run'); } } = {}) =>
  new Function('$input', '$env', '$json', '$', node(name).parameters.jsCode)({ first: () => ({ json: input }) }, env, json, lookup)[0].json;

test('prepara mensagens do contrato do fluxo pai', () => {
  const result = run('Validar e Preparar', { input: { MSG_Prompt_System: 'sistema', MSG_Prompt_User: 'tema' }, env: { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) } });
  assert.deepEqual(result.contexto.request_body.messages, [{ role: 'system', content: 'sistema' }, { role: 'user', content: 'tema' }]);
  assert.equal(result.contexto.modelo, MODEL);
  assert.throws(() => run('Validar e Preparar'), /obrigatórios/);
  assert.throws(() => run('Validar e Preparar', { input: { MSG_Prompt_System: 's', MSG_Prompt_User: 'u' } }), /ACCOUNT_ID/);
});

test('sucesso entrega o contrato Gemini e falhas não viram prompt', () => {
  const context = { modelo: MODEL, _core: { tentativa: 1, max_tentativas: 3 } };
  const lookup = name => { if (name === 'Validar e Preparar') return { first: () => ({ json: { contexto: context } }) }; throw Error('not run'); };
  const success = run('Interpretar Resposta', { json: { statusCode: 200, body: { success: true, result: { response: 'photo', usage: { total_tokens: 12 } } } }, lookup });
  assert.deepEqual(run('Normalizar Sucesso', { input: success }), { text: 'photo', modelo: MODEL, tokens: 12 });
  const rate = run('Interpretar Resposta', { json: { statusCode: 429 }, lookup });
  assert.equal(rate._route, 'error');
  assert.throws(() => run('Normalizar Erro', { input: rate }), /LIMIT_EXCEEDED/);
  assert.equal(run('Interpretar Resposta', { json: { statusCode: 503 }, lookup })._route, 'retry');
  assert.equal(run('Interpretar Resposta', { json: { statusCode: 200, body: { result: {} } }, lookup })._route, 'error');
});

test('artefato é inativo, compila e usa credencial por referência', () => {
  assert.equal(workflow.active, false);
  for (const n of workflow.nodes.filter(n => n.type === 'n8n-nodes-base.code')) assert.doesNotThrow(() => new Function(n.parameters.jsCode));
  const http = node('Cloudflare Workers AI');
  assert.equal(http.parameters.genericAuthType, 'httpHeaderAuth');
  assert.equal(http.credentials.httpHeaderAuth.id, undefined);
  assert.doesNotMatch(JSON.stringify(workflow), /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/i);
});
