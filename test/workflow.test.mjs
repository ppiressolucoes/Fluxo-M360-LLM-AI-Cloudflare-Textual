import test from "node:test";
import assert from "node:assert/strict";
import { createWorkflow } from "../src/workflow.mjs";

test("workflow possui os nodes essenciais e permanece inativo após importação", () => {
  const workflow = createWorkflow();
  const names = new Set(workflow.nodes.map(({ name }) => name));
  for (const name of [
    "Entrada M360",
    "Validar e Preparar",
    "Cloudflare Workers AI",
    "Interpretar Resposta",
    "Normalizar Sucesso",
    "Normalizar Erro",
  ]) {
    assert.equal(names.has(name), true, `Node ausente: ${name}`);
  }
  assert.equal(workflow.active, false);
});

test("workflow chama somente o endpoint REST oficial esperado", () => {
  const workflow = createWorkflow();
  const http = workflow.nodes.find(({ name }) => name === "Cloudflare Workers AI");
  assert.match(http.parameters.url, /^=\{\{ 'https:\/\/api\.cloudflare\.com\//);
  assert.equal(http.parameters.method, "POST");
  assert.equal(http.parameters.options.timeout, 30000);
});

test("workflow exportado não contém valores de credenciais", () => {
  const workflow = createWorkflow();
  const serialized = JSON.stringify(workflow);
  assert.doesNotMatch(serialized, /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/i);
  const http = workflow.nodes.find(({ name }) => name === "Cloudflare Workers AI");
  assert.equal("id" in http.credentials.httpHeaderAuth, false);
});

test("código inline dos nodes compila e todas as conexões apontam para nodes existentes", () => {
  const workflow = createWorkflow();
  const names = new Set(workflow.nodes.map(({ name }) => name));

  for (const node of workflow.nodes) {
    if (node.type === "n8n-nodes-base.code") {
      assert.doesNotThrow(
        () => new Function(node.parameters.jsCode),
        `JavaScript inválido no node ${node.name}`,
      );
    }
  }

  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.equal(names.has(source), true, `Origem desconhecida: ${source}`);
    for (const branches of outputs.main) {
      for (const connection of branches) {
        assert.equal(
          names.has(connection.node),
          true,
          `Destino desconhecido: ${connection.node}`,
        );
      }
    }
  }
});
