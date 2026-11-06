import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateGroqResults,
  createGroqTasks,
  interpretGroqResponse,
  normalizeApiSelection,
  parseUserPromptFields,
  prepareGroqRequest,
  preprocessHtml,
  splitText,
  validateGroqInput,
} from "../src/groq-core.mjs";

const input = {
  content_id: "piloto-groq-001",
  Titulo: "Brasil amplia geração solar",
  "Conteúdo": "<p>Primeiro parágrafo com informação editorial.</p><p>Segundo parágrafo com mais contexto.</p>",
  Legenda_IMG: "Parque solar. Foto: Divulgação",
  MSG_Prompt_User: "Traduza o título, o contexto e a legenda fornecidos.",
  MSG_Prompt_System: "Traduza para en-US.\n8. Preserve o HTML.\n11. Entregue exclusivamente um JSON válido.\nSaída obrigatória: {...}",
};

const api = {
  id: 7,
  dsc_plataforma: "groq",
  dsc_api_key: "segredo-de-teste",
  dsc_url_servico: "openai/gpt-oss-20b",
  dsc_status: "Sucesso",
};

test("fragmenta sem perder palavras e prioriza limites HTML", () => {
  const text = Array.from({ length: 80 }, (_, index) => `<p>Frase editorial ${index}.</p>`).join("");
  const chunks = splitText(text, 500);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 500));
  assert.equal(chunks.join(""), text);
  assert.ok(chunks.slice(0, -1).every((chunk) => chunk.endsWith("</p>")));
});

test("remove links internos e o widget de notícias relacionadas antes da IA", () => {
  const html = [
    '<p>Leia <a class="interno" href="https://energialimpa.live/noticia">esta notícia</a>.</p>',
    "<div><h2>NOTÍCIAS RELACIONADAS:</h2><div><p>Item interno</p></div></div>",
    '<p><a href="https://example.com/fonte">Fonte externa</a></p>',
  ].join("");
  const result = preprocessHtml(html);
  assert.match(result, /Leia esta notícia/);
  assert.doesNotMatch(result, /energialimpa\.live|NOTÍCIAS RELACIONADAS|Item interno/);
  assert.match(result, /https:\/\/example\.com\/fonte/);
});

test("valida o contrato do fluxo pai e cria tarefas de título, HTML e legenda", () => {
  assert.equal(validateGroqInput(input).ok, true);
  const result = createGroqTasks({ ...input, "Conteúdo": `<p>${"x ".repeat(800)}</p>` }, 500);
  assert.equal(result.ok, true);
  assert.equal(result.tasks[0].task_type, "title");
  assert.equal(result.tasks.at(-1).task_type, "caption");
  assert.ok(result.tasks.filter(({ task_type }) => task_type === "content").length > 1);
  assert.equal(result.tasks[0].task_marker, "[M360_FIM_0001]");
  assert.doesNotMatch(result.tasks[0].editorial_rules, /JSON válido/);
});

test("extrai título, contexto e legenda quando o pai envia somente os prompts", () => {
  const promptOnly = {
    MSG_Prompt_User: [
      "Você é um editor especializado.",
      "",
      "- Título: Queda no desemprego atinge 5,2 porcento",
      "- Contexto: <p>Primeiro parágrafo.</p>",
      "<p>Segundo parágrafo.</p>",
      "",
      "- Legenda: <p>Novas oportunidades/Arquivo/Agência SP</p>",
    ].join("\n"),
    MSG_Prompt_System: input.MSG_Prompt_System,
  };
  assert.deepEqual(parseUserPromptFields(promptOnly.MSG_Prompt_User), {
    title: "Queda no desemprego atinge 5,2 porcento",
    content: "<p>Primeiro parágrafo.</p>\n<p>Segundo parágrafo.</p>",
    caption: "Novas oportunidades/Arquivo/Agência SP",
  });
  const validation = validateGroqInput(promptOnly);
  assert.equal(validation.ok, true);
  assert.equal(validation.value.title, "Queda no desemprego atinge 5,2 porcento");
  assert.equal(validation.value.caption, "Novas oportunidades/Arquivo/Agência SP");
});

test("recusa entrada sem campos ou prompts obrigatórios", () => {
  const result = validateGroqInput({ Titulo: "Título" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map(({ field }) => field), ["Conteúdo", "MSG_Prompt_User", "MSG_Prompt_System"]);
});

test("normaliza os formatos aninhados retornados por CALL no MySQL", () => {
  assert.equal(normalizeApiSelection([[api], { affectedRows: 0 }]).value.api_id, 7);
  assert.equal(normalizeApiSelection({ 0: api }).value.model, "openai/gpt-oss-20b");
});

test("recusa seleção sem chave ou sem modelo", () => {
  assert.equal(normalizeApiSelection({ dsc_status: "Nenhuma API disponível" }).ok, false);
  assert.equal(normalizeApiSelection({ ...api, dsc_url_servico: "" }).error.code, "MODEL_NOT_CONFIGURED");
});

test("prepara requisição por tarefa sem chave no corpo e sem exigir JSON parcial", () => {
  const task = createGroqTasks(input).tasks[1];
  const result = prepareGroqRequest(task, api);
  assert.equal(result.ok, true);
  assert.equal(result.context.request_body.model, "openai/gpt-oss-20b");
  assert.equal(result.context.request_body.reasoning_effort, "low");
  assert.equal(JSON.stringify(result.context.request_body).includes(api.dsc_api_key), false);
  assert.match(result.context.request_body.messages[0].content, /não se aplicam a esta etapa interna/);
  assert.equal(result.context.request_body.messages[1].content, task.source_text);
});

test("aceita resposta completa com finish_reason stop e marcador", () => {
  const context = prepareGroqRequest(createGroqTasks(input).tasks[0], api).context;
  const result = interpretGroqResponse({
    statusCode: 200,
    body: {
      choices: [{ message: { content: `Brazil Expands Solar Generation\n${context.task_marker}` }, finish_reason: "stop" }],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
    },
  }, context);
  assert.equal(result.status, "success");
  assert.equal(result.translated_text, "Brazil Expands Solar Generation");
  assert.equal(result.task_type, "title");
  assert.equal(result.marker_present, true);
  assert.equal(result.completion_validation, "exact_marker");
});

test("aceita HTML completo sem marcador usando fallback auditável", () => {
  const context = prepareGroqRequest(createGroqTasks(input).tasks[1], api).context;
  const result = interpretGroqResponse({
    statusCode: 200,
    body: {
      choices: [{
        message: { content: "<p>Brazil expands clean energy production while preserving supply security.</p>" },
        finish_reason: "stop",
      }],
    },
  }, { ...context, source_text: "<p>O Brasil amplia a produção de energia limpa preservando a segurança do abastecimento.</p>" });
  assert.equal(result.status, "success");
  assert.equal(result.marker_present, false);
  assert.equal(result.completion_validation, "fallback_without_marker");
  assert.ok(result.output_source_length_ratio >= 0.60);
});

test("aceita HTML completo sem exigir a mesma última tag do original", () => {
  const context = prepareGroqRequest(createGroqTasks(input).tasks[1], api).context;
  const result = interpretGroqResponse({
    statusCode: 200,
    body: {
      choices: [{
        message: { content: "<p>Brazil expands clean energy production while preserving supply security and industrial resilience.</p>" },
        finish_reason: "stop",
      }],
    },
  }, { ...context, source_text: "<div><p>O Brasil amplia a produção de energia limpa preservando a segurança do abastecimento e a resiliência industrial.</p></div>" });
  assert.equal(result.status, "success");
  assert.equal(result.completion_validation, "fallback_without_marker");
});

test("rejeita HTML sem marcador quando aparenta estar truncado", () => {
  const context = prepareGroqRequest(createGroqTasks(input).tasks[1], api).context;
  const result = interpretGroqResponse({
    statusCode: 200,
    body: {
      choices: [{ message: { content: "<p>Brazil expands clean" }, finish_reason: "stop" }],
    },
  }, { ...context, source_text: "<p>O Brasil amplia a produção de energia limpa preservando a segurança do abastecimento.</p>" });
  assert.equal(result.status, "error");
  assert.equal(result.code, "INCOMPLETE_TRANSLATION");
});

test("rejeita resposta truncada mesmo quando contém texto", () => {
  const context = prepareGroqRequest(createGroqTasks(input).tasks[1], api).context;
  const result = interpretGroqResponse({
    statusCode: 200,
    body: { choices: [{ message: { content: "Partial translation" }, finish_reason: "length" }] },
  }, context);
  assert.equal(result.status, "error");
  assert.equal(result.code, "INCOMPLETE_TRANSLATION");
  assert.equal(result.requires_smaller_chunk, true);
});

test("classifica bloqueio organizacional do modelo para failover de API", () => {
  const context = prepareGroqRequest(createGroqTasks(input).tasks[0], api).context;
  const result = interpretGroqResponse({
    statusCode: 403,
    body: { error: { message: "Model blocked.", code: "model_permission_blocked_org" } },
  }, context);
  assert.equal(result.code, "MODEL_PERMISSION_BLOCKED");
  assert.equal(result.category, "model_permission");
  assert.equal(result.retry_with_another_api, true);
  assert.equal(result.block_seconds, 3600);
});

test("monta somente o JSON final obrigatório e recusa falha ou troca de modelo", () => {
  const base = { status: "success", task_total: 4, finish_reason: "stop", source_characters: 10, usage: {}, model: "modelo-a", caption_expected: true };
  const success = aggregateGroqResults([
    { ...base, task_index: 4, task_type: "caption", part_index: 1, part_total: 1, translated_text: "Solar park. Photo: Disclosure" },
    { ...base, task_index: 3, task_type: "content", part_index: 2, part_total: 2, translated_text: "<p>Two</p>" },
    { ...base, task_index: 1, task_type: "title", part_index: 1, part_total: 1, translated_text: "Clean Energy" },
    { ...base, task_index: 2, task_type: "content", part_index: 1, part_total: 2, translated_text: "<p>One</p>" },
  ]);
  assert.deepEqual(success, {
    idioma: "en-US",
    titulo_en: "Clean Energy",
    conteudo_en: "<p>One</p>\n<p>Two</p>",
    legenda_imagem_en: "Solar park. Photo: Disclosure",
  });

  const drift = aggregateGroqResults([
    { ...base, task_index: 1, task_type: "title", part_index: 1, part_total: 1, translated_text: "Title" },
    { ...base, task_index: 2, task_type: "content", part_index: 1, part_total: 2, translated_text: "One" },
    { ...base, task_index: 3, task_type: "content", part_index: 2, part_total: 2, translated_text: "Two", model: "modelo-b" },
    { ...base, task_index: 4, task_type: "caption", part_index: 1, part_total: 1, translated_text: "Caption" },
  ]);
  assert.equal(drift.erro.codigo, "MODEL_DRIFT");
});
