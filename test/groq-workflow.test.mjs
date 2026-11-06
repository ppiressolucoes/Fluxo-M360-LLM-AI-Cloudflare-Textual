import test from "node:test";
import assert from "node:assert/strict";
import { createGroqWorkflow } from "../src/groq-workflow.mjs";

test("workflow Groq contém seleção por SP, loop sequencial e agregação", () => {
  const workflow = createGroqWorkflow();
  const names = new Set(workflow.nodes.map(({ name }) => name));
  for (const name of ["Validar e Fragmentar", "Loop de Tarefas", "SP Selecionar API Groq", "HTTP Groq Chat Completions", "Validar Resposta Groq", "Montar JSON Final"]) {
    assert.equal(names.has(name), true, `Node ausente: ${name}`);
  }
  assert.equal(workflow.name, "LLM CORE AI Cross Account Textual | Piloto Groq");
  assert.equal(workflow.active, false);
});

test("workflow chama somente Groq e usa a SP esperada", () => {
  const workflow = createGroqWorkflow();
  const http = workflow.nodes.find(({ name }) => name === "HTTP Groq Chat Completions");
  const sql = workflow.nodes.find(({ name }) => name === "SP Selecionar API Groq");
  assert.equal(http.parameters.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(sql.parameters.query, "CALL sp_get_api('groq');");
});

test("JavaScript inline compila e conexões apontam para nodes existentes", () => {
  const workflow = createGroqWorkflow();
  const names = new Set(workflow.nodes.map(({ name }) => name));
  for (const node of workflow.nodes) {
    if (node.type === "n8n-nodes-base.code") assert.doesNotThrow(() => new Function(node.parameters.jsCode));
  }
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.equal(names.has(source), true);
    for (const branch of outputs.main) for (const connection of branch) assert.equal(names.has(connection.node), true);
  }
});

test("workflow não contém valor real de chave", () => {
  const serialized = JSON.stringify(createGroqWorkflow());
  assert.doesNotMatch(serialized, /gsk_[A-Za-z0-9]{20,}/);
});

test("workflow aceita o contrato do pai e monta o JSON editorial final", () => {
  const workflow = createGroqWorkflow();
  const fragment = workflow.nodes.find(({ name }) => name === "Validar e Fragmentar").parameters.jsCode;
  const aggregate = workflow.nodes.find(({ name }) => name === "Montar JSON Final").parameters.jsCode;
  for (const field of ["Titulo", "Conteúdo", "Legenda_IMG", "MSG_Prompt_User", "MSG_Prompt_System"]) {
    assert.match(fragment, new RegExp(field));
  }
  for (const field of ["idioma", "titulo_en", "conteudo_en", "legenda_imagem_en"]) {
    assert.match(aggregate, new RegExp(field));
  }
});

test("node inline aceita o formato observado com apenas os dois prompts", () => {
  const workflow = createGroqWorkflow();
  const code = workflow.nodes.find(({ name }) => name === "Validar e Fragmentar").parameters.jsCode;
  const run = new Function("$input", code);
  const result = run({
    first: () => ({ json: {
      MSG_Prompt_User: "Instrução editorial.\n\n- Título: Energia limpa cresce\n- Contexto: <p>Conteúdo da notícia.</p>\n\n- Legenda: <p>Parque solar/Arquivo</p>",
      MSG_Prompt_System: "Traduza para en-US.\n11. Entregue JSON.",
    } }),
  });
  assert.equal(result[0].json._route, "task");
  assert.equal(result[0].json.task_type, "title");
  assert.equal(result[0].json.source_text, "Energia limpa cresce");
  assert.equal(result.at(-1).json.task_type, "caption");
  assert.equal(result.at(-1).json.source_text, "Parque solar/Arquivo");
});
