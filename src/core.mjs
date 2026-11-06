export const MODEL = "@cf/meta/m2m100-1.2b";
export const MAX_ATTEMPTS = 3;
export const SUPPORTED_LANGUAGES = Object.freeze([
  "ar",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "ja",
  "pt",
  "ru",
  "zh",
]);

const LANGUAGE_SET = new Set(SUPPORTED_LANGUAGES);

function normalizeLanguage(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return LANGUAGE_SET.has(normalized) ? normalized : null;
}

function validationError(field, code, message) {
  return { field, code, message };
}

export function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      ok: false,
      errors: [
        validationError(
          "$",
          "INVALID_INPUT",
          "A entrada deve ser um objeto JSON.",
        ),
      ],
    };
  }

  const errors = [];
  const text =
    typeof input.texto_original === "string"
      ? input.texto_original.trim()
      : "";
  const sourceLanguage = normalizeLanguage(input.idioma_origem);
  const targetLanguage = normalizeLanguage(input.idioma_destino);

  if (!text) {
    errors.push(
      validationError(
        "texto_original",
        "REQUIRED_FIELD",
        "texto_original deve ser uma string não vazia.",
      ),
    );
  }

  if (!sourceLanguage) {
    errors.push(
      validationError(
        "idioma_origem",
        "UNSUPPORTED_LANGUAGE",
        `idioma_origem deve usar um destes códigos: ${SUPPORTED_LANGUAGES.join(", ")}.`,
      ),
    );
  }

  if (!targetLanguage) {
    errors.push(
      validationError(
        "idioma_destino",
        "UNSUPPORTED_LANGUAGE",
        `idioma_destino deve usar um destes códigos: ${SUPPORTED_LANGUAGES.join(", ")}.`,
      ),
    );
  }

  if (
    input.instrucoes_traducao !== undefined &&
    input.instrucoes_traducao !== null &&
    String(input.instrucoes_traducao).trim() !== ""
  ) {
    errors.push(
      validationError(
        "instrucoes_traducao",
        "UNSUPPORTED_INSTRUCTIONS",
        "O modelo especializado do piloto não aceita instruções editoriais livres.",
      ),
    );
  }

  if (
    input.content_id !== undefined &&
    input.content_id !== null &&
    !["string", "number"].includes(typeof input.content_id)
  ) {
    errors.push(
      validationError(
        "content_id",
        "INVALID_FIELD",
        "content_id deve ser string ou número quando informado.",
      ),
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      content_id:
        input.content_id === undefined || input.content_id === null
          ? null
          : String(input.content_id),
      tipo_conteudo:
        typeof input.tipo_conteudo === "string" &&
        input.tipo_conteudo.trim()
          ? input.tipo_conteudo.trim()
          : "texto",
      idioma_origem: sourceLanguage,
      idioma_destino: targetLanguage,
      texto_original: text,
    },
  };
}

export function prepareRequest(input, accountId) {
  const validation = validateInput(input);
  if (!validation.ok) return validation;

  if (typeof accountId !== "string" || !accountId.trim()) {
    return {
      ok: false,
      errors: [
        validationError(
          "CLOUDFLARE_ACCOUNT_ID",
          "MISSING_CONFIGURATION",
          "CLOUDFLARE_ACCOUNT_ID não está configurado no ambiente do n8n.",
        ),
      ],
    };
  }

  const value = validation.value;
  return {
    ok: true,
    context: {
      ...value,
      account_id: accountId.trim(),
      modelo: MODEL,
      request_body: {
        text: value.texto_original,
        source_lang: value.idioma_origem,
        target_lang: value.idioma_destino,
      },
      _core: {
        tentativa: 1,
        max_tentativas: MAX_ATTEMPTS,
      },
    },
  };
}

export function sanitizeDiagnostic(value) {
  const text = String(value ?? "Erro não detalhado.")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/(?:token|api[_ -]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, "[CREDENCIAL REDACTED]")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 500);
}

function responseMessage(body, fallback) {
  const error = Array.isArray(body?.errors) ? body.errors[0] : body?.error;
  return sanitizeDiagnostic(
    error?.message ?? error ?? body?.message ?? fallback,
  );
}

function errorDefinition(statusCode, body) {
  if (statusCode === 401 || statusCode === 403) {
    return {
      code: "AUTHENTICATION_FAILED",
      category: "authentication",
      retryable: false,
      diagnostic: responseMessage(body, "Autenticação recusada pela Cloudflare."),
    };
  }
  if (statusCode === 404) {
    return {
      code: "MODEL_UNAVAILABLE",
      category: "model",
      retryable: false,
      diagnostic: responseMessage(body, "Modelo ou endpoint não encontrado."),
    };
  }
  if (statusCode === 429) {
    return {
      code: "LIMIT_EXCEEDED",
      category: "quota_or_rate_limit",
      retryable: false,
      diagnostic: responseMessage(body, "Limite de uso atingido."),
    };
  }
  if ([408, 425, 500, 502, 503, 504].includes(statusCode)) {
    return {
      code: statusCode === 408 ? "TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      category: statusCode === 408 ? "timeout" : "upstream",
      retryable: true,
      diagnostic: responseMessage(body, "Falha transitória na Cloudflare."),
    };
  }
  if (statusCode >= 400) {
    return {
      code: "CLOUDFLARE_API_ERROR",
      category: "api",
      retryable: false,
      diagnostic: responseMessage(body, `A Cloudflare retornou HTTP ${statusCode}.`),
    };
  }
  return {
    code: "NETWORK_ERROR",
    category: "communication",
    retryable: true,
    diagnostic: responseMessage(body, "Falha de comunicação com a Cloudflare."),
  };
}

export function interpretResponse(httpResponse, context) {
  const statusCode = Number(httpResponse?.statusCode ?? 0);
  const body = httpResponse?.body ?? httpResponse;
  const translatedText = body?.result?.translated_text;
  const attempt = Number(context?._core?.tentativa ?? 1);
  const maxAttempts = Number(
    context?._core?.max_tentativas ?? MAX_ATTEMPTS,
  );

  if (
    statusCode >= 200 &&
    statusCode < 300 &&
    body?.success !== false &&
    typeof translatedText === "string" &&
    translatedText.trim()
  ) {
    return {
      route: "success",
      translated_text: translatedText.trim(),
      usage: body?.result?.usage ?? body?.usage ?? null,
      status_code: statusCode,
    };
  }

  let error;
  if (statusCode >= 200 && statusCode < 300) {
    error = {
      code: "EMPTY_OR_INVALID_RESPONSE",
      category: "response",
      retryable: true,
      diagnostic: "A resposta não contém result.translated_text válido.",
    };
  } else {
    error = errorDefinition(statusCode, body);
  }

  const mayRetry = error.retryable && attempt < maxAttempts;
  return {
    route: mayRetry ? "retry" : "error",
    ...error,
    exhausted: error.retryable && !mayRetry,
    status_code: statusCode || null,
    retry_delay_seconds: mayRetry ? Math.min(2 ** attempt, 10) : null,
  };
}

export function normalizeSuccess(context, interpretation) {
  return {
    content_id: context.content_id,
    status: "success",
    tipo_conteudo: context.tipo_conteudo,
    idioma_origem: context.idioma_origem,
    idioma_destino: context.idioma_destino,
    texto_traduzido: interpretation.translated_text,
    modelo: context.modelo,
    metricas: {
      tentativas: context._core.tentativa,
      caracteres_entrada: context.texto_original.length,
      caracteres_saida: interpretation.translated_text.length,
      consumo_cloudflare: interpretation.usage,
    },
  };
}

export function normalizeFailure(context, interpretation) {
  return {
    content_id: context?.content_id ?? null,
    status: "error",
    tipo_conteudo: context?.tipo_conteudo ?? null,
    idioma_origem: context?.idioma_origem ?? null,
    idioma_destino: context?.idioma_destino ?? null,
    texto_traduzido: null,
    modelo: context?.modelo ?? MODEL,
    erro: {
      codigo: interpretation.code,
      categoria: interpretation.category,
      diagnostico: sanitizeDiagnostic(interpretation.diagnostic),
      http_status: interpretation.status_code ?? null,
      tentativas: context?._core?.tentativa ?? 0,
      esgotou_tentativas: Boolean(interpretation.exhausted),
    },
  };
}
