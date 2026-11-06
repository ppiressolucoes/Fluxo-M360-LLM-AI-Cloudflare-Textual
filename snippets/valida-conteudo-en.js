// n8n Code node: Valida Conteudo EN
// Mode: Run Once for All Items

const inputItems = $input.all();

function stripCodeFence(value) {
  return String(value ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .trim();
}

function parseLegacyText(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  const cleaned = stripCodeFence(value);
  if (!cleaned) {
    throw new Error('Campo "text" não encontrado ou vazio na resposta legada.');
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('Não foi possível localizar um objeto JSON completo em "text".');
  }

  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch {
    throw new Error('O campo "text" não contém um JSON válido.');
  }
}

function decodeBasicEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function cleanText(value) {
  return decodeBasicEntities(value)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function cleanCaption(value) {
  return cleanText(value)
    .replace(/<\/?p\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanHtmlContent(value) {
  let html = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\</g, '<')
    .replace(/\\>/g, '>')
    .trim();

  html = html
    .replace(/<p\b[^>]*>\s*(<h[1-6]\b[^>]*>)/gi, '$1')
    .replace(/(<\/h[1-6]>)\s*<\/p>/gi, '$1')
    .replace(/(<a\b[^>]*>)\s*<br\s*\/?>\s*/gi, '$1')
    .replace(/\s*<br\s*\/?>\s*(<\/a>)/gi, '$1')
    .replace(/<p\b[^>]*>\s*(?:&nbsp;)?\s*<\/p>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/>\s+</g, '><')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return html;
}

function errorItem(item, code, diagnostic, details = null) {
  return {
    json: {
      _route: 'error',
      status: 'error',
      validation_ok: false,
      content_id: item.json?.content_id ?? null,
      wp_status: 'not_created',
      erro: {
        codigo: code,
        diagnostico: diagnostic,
        detalhes: details,
      },
    },
    binary: item.binary,
  };
}

return inputItems.map((item) => {
  const source = item.json ?? {};

  if (source.status === 'error' || source.erro) {
    return errorItem(
      item,
      source.erro?.codigo ?? 'LLM_SUBWORKFLOW_ERROR',
      source.erro?.diagnostico ?? 'O subworkflow de tradução retornou erro.',
      source.erro?.tarefas ?? source.erro?.detalhes ?? null,
    );
  }

  const hasStructuredContract = [
    'idioma',
    'titulo_en',
    'conteudo_en',
    'legenda_imagem_en',
  ].some((field) => Object.hasOwn(source, field));

  let parsed;
  let parseMethod;
  let rawText = null;

  try {
    if (hasStructuredContract) {
      parsed = source;
      parseMethod = 'structured_object';
    } else {
      rawText = source.text;
      parsed = parseLegacyText(rawText);
      parseMethod = 'legacy_text_json';
    }
  } catch (error) {
    return errorItem(
      item,
      'INVALID_LLM_RESPONSE',
      error instanceof Error ? error.message : 'Falha ao interpretar a resposta da LLM.',
    );
  }

  const idioma = cleanText(parsed.idioma || 'en-US');
  const tituloEn = cleanText(parsed.titulo_en);
  const conteudoEn = cleanHtmlContent(parsed.conteudo_en);
  const legendaImagemEn = cleanCaption(parsed.legenda_imagem_en);

  const missingFields = [];
  if (!tituloEn) missingFields.push('titulo_en');
  if (!conteudoEn) missingFields.push('conteudo_en');

  if (missingFields.length) {
    return errorItem(
      item,
      'MISSING_TRANSLATION_FIELDS',
      `Campos obrigatórios ausentes ou vazios: ${missingFields.join(', ')}.`,
      missingFields,
    );
  }

  if (idioma.toLowerCase() !== 'en-us') {
    return errorItem(
      item,
      'INVALID_TARGET_LANGUAGE',
      `Idioma retornado pela tradução não é en-US: ${idioma}.`,
    );
  }

  return {
    json: {
      _route: 'success',
      status: 'success',
      validation_ok: true,
      idioma: 'en-US',
      titulo_en: tituloEn,
      conteudo_en: conteudoEn,
      legenda_imagem_en: legendaImagemEn,
      wp_status: 'draft',
      wp_lang: 'en',
      wp_locale: 'en-US',
      ai_parse_status: 'ok',
      ai_parse_method: parseMethod,
      ai_raw_text: rawText,
    },
    binary: item.binary,
  };
});
