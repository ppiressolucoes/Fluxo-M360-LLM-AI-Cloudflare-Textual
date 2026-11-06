import test from "node:test";
import assert from "node:assert/strict";
import {
  interpretResponse,
  normalizeFailure,
  normalizeSuccess,
  prepareRequest,
  sanitizeDiagnostic,
  validateInput,
} from "../src/core.mjs";

const validInput = {
  content_id: "piloto-001",
  tipo_conteudo: "artigo",
  idioma_origem: "pt-BR",
  idioma_destino: "en",
  texto_original: "O governo anunciou uma nova política energética.",
};

test("valida e normaliza a entrada editorial", () => {
  const result = validateInput(validInput);
  assert.equal(result.ok, true);
  assert.equal(result.value.idioma_origem, "pt");
  assert.equal(result.value.idioma_destino, "en");
});

test("rejeita texto vazio, idioma desconhecido e instruções não suportadas", () => {
  const result = validateInput({
    texto_original: " ",
    idioma_origem: "xx",
    idioma_destino: "en",
    instrucoes_traducao: "Use o estilo do portal.",
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map(({ code }) => code),
    ["REQUIRED_FIELD", "UNSUPPORTED_LANGUAGE", "UNSUPPORTED_INSTRUCTIONS"],
  );
});

test("exige Account ID sem colocar token no contexto", () => {
  assert.equal(prepareRequest(validInput, "").ok, false);
  const result = prepareRequest(validInput, "account-123");
  assert.equal(result.ok, true);
  assert.deepEqual(result.context.request_body, {
    text: validInput.texto_original,
    source_lang: "pt",
    target_lang: "en",
  });
  assert.equal("token" in result.context, false);
});

test("normaliza resposta de tradução bem-sucedida", () => {
  const { context } = prepareRequest(validInput, "account-123");
  const interpretation = interpretResponse(
    {
      statusCode: 200,
      body: {
        success: true,
        result: { translated_text: "The government announced a new energy policy." },
      },
    },
    context,
  );
  assert.equal(interpretation.route, "success");
  const output = normalizeSuccess(context, interpretation);
  assert.equal(output.status, "success");
  assert.equal(output.texto_traduzido, "The government announced a new energy policy.");
  assert.equal("texto_original" in output, false);
});

test("não repete autenticação ou limite de uso", () => {
  const { context } = prepareRequest(validInput, "account-123");
  for (const statusCode of [401, 403, 429]) {
    const result = interpretResponse({ statusCode, body: {} }, context);
    assert.equal(result.route, "error");
    assert.equal(result.retryable, false);
  }
});

test("repete somente falhas transitórias até o limite", () => {
  const { context } = prepareRequest(validInput, "account-123");
  const first = interpretResponse({ statusCode: 503, body: {} }, context);
  assert.equal(first.route, "retry");
  assert.equal(first.retry_delay_seconds, 2);

  context._core.tentativa = 3;
  const last = interpretResponse({ statusCode: 503, body: {} }, context);
  assert.equal(last.route, "error");
  assert.equal(last.exhausted, true);
  assert.equal(normalizeFailure(context, last).erro.esgotou_tentativas, true);
});

test("redige credenciais de diagnósticos", () => {
  const diagnostic = sanitizeDiagnostic(
    "Authorization: Bearer secret-token API_KEY=also-secret",
  );
  assert.doesNotMatch(diagnostic, /secret-token|also-secret/);
});
