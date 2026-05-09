const API_BASE = process.env.NEXT_PUBLIC_API_URL;
const API_ORIGIN = API_BASE ? API_BASE.replace(/\/api\/v1\/?$/, '') : '';

export const BLOCK_TYPES = {
  RICH_TEXT: 'rich_text',
  HEADING: 'heading',
  IMAGE: 'image',
  VIDEO: 'video',
  FILE: 'file',
  DIVIDER: 'divider',
  CALLOUT: 'callout',
  QUIZ_EMBED: 'quiz_embed',
  CTA: 'cta',
  EMBED: 'embed',
};

const SAFE_URL = /^(https?:\/\/|\/|#)/i;

export function resolveAssetUrl(input = '') {
  if (!input || typeof input !== 'string') return '';
  if (input.startsWith('http://') || input.startsWith('https://')) return input;
  if (input.startsWith('/certificates')) return `${API_ORIGIN}${input}`;
  if (input.startsWith('/api/v1')) return `${API_BASE}${input.replace(/^\/api\/v1/, '')}`;
  if (input.startsWith('/uploads')) return `${API_BASE}${input}`;
  return `${API_BASE}${input.startsWith('/') ? input : `/${input}`}`;
}

export function normalizeEditorDocument(content = {}, title = '') {
  const parsed = typeof content === 'string' ? JSON.parse(content || '{}') : (content || {});
  const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];

  if (!blocks.length && Array.isArray(parsed.sections)) {
    const sectionBlocks = [];
    parsed.sections.forEach((section, index) => {
      sectionBlocks.push({
        id: `legacy-heading-${index}`,
        type: BLOCK_TYPES.HEADING,
        order: sectionBlocks.length,
        payload: { text: section.heading || `Section ${index + 1}`, level: 2 },
      });
      (section.paragraphs || []).forEach((paragraph) => {
        sectionBlocks.push({
          id: `legacy-paragraph-${index}-${sectionBlocks.length}`,
          type: BLOCK_TYPES.RICH_TEXT,
          order: sectionBlocks.length,
          payload: { text: paragraph },
        });
      });
      if (section.image) {
        const image = typeof section.image === 'string' ? { src: section.image } : section.image;
        sectionBlocks.push({
          id: `legacy-image-${index}`,
          type: BLOCK_TYPES.IMAGE,
          order: sectionBlocks.length,
          payload: image,
        });
      }
    });

    return {
      schema_version: 3,
      title: parsed.title || title || '',
      blocks: sectionBlocks,
      metadata: parsed.metadata || {},
    };
  }

  return {
    schema_version: Number(parsed.schema_version || 3),
    title: parsed.title || title || '',
    blocks,
    metadata: parsed.metadata || {},
  };
}

export function sanitizeText(value = '') {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

export function sanitizeBlockForSave(block, index = 0) {
  const type = Object.values(BLOCK_TYPES).includes(block?.type) ? block.type : BLOCK_TYPES.RICH_TEXT;
  const payload = block?.payload || {};

  const safe = {
    id: String(block?.id || `block-${Date.now()}-${index}`),
    type,
    order: index,
    payload: {},
    meta: {
      analyticsKey: sanitizeText(block?.meta?.analyticsKey || `${type}_${index + 1}`),
      tags: Array.isArray(block?.meta?.tags) ? block.meta.tags.map((tag) => sanitizeText(tag)).filter(Boolean) : [],
      aiHints: {
        semanticRole: sanitizeText(block?.meta?.aiHints?.semanticRole || ''),
        summary: sanitizeText(block?.meta?.aiHints?.summary || ''),
        difficulty: sanitizeText(block?.meta?.aiHints?.difficulty || ''),
      },
    },
  };

  const url = (value) => {
    const text = sanitizeText(value);
    if (!text) return '';
    return SAFE_URL.test(text) ? text : '';
  };

  if (type === BLOCK_TYPES.HEADING) {
    safe.payload = { text: sanitizeText(payload.text), level: Math.min(4, Math.max(1, Number(payload.level || 2))) };
  } else if (type === BLOCK_TYPES.RICH_TEXT) {
    safe.payload = { text: sanitizeText(payload.text) };
  } else if (type === BLOCK_TYPES.IMAGE) {
    safe.payload = {
      src: url(payload.src),
      alt: sanitizeText(payload.alt),
      caption: sanitizeText(payload.caption),
      width: Math.min(100, Math.max(20, Number(payload.width || 100))),
      align: ['left', 'center', 'right'].includes(payload.align) ? payload.align : 'center',
    };
  } else if (type === BLOCK_TYPES.VIDEO) {
    safe.payload = { src: url(payload.src), title: sanitizeText(payload.title), provider: sanitizeText(payload.provider || 'direct') };
  } else if (type === BLOCK_TYPES.FILE) {
    safe.payload = { href: url(payload.href), label: sanitizeText(payload.label), fileType: sanitizeText(payload.fileType) };
  } else if (type === BLOCK_TYPES.DIVIDER) {
    safe.payload = { style: ['solid', 'dashed'].includes(payload.style) ? payload.style : 'solid' };
  } else if (type === BLOCK_TYPES.CALLOUT) {
    safe.payload = {
      tone: ['info', 'warning', 'success', 'danger'].includes(payload.tone) ? payload.tone : 'info',
      title: sanitizeText(payload.title),
      body: sanitizeText(payload.body),
    };
  } else if (type === BLOCK_TYPES.QUIZ_EMBED) {
    safe.payload = { quizId: sanitizeText(payload.quizId), title: sanitizeText(payload.title) };
  } else if (type === BLOCK_TYPES.CTA) {
    safe.payload = { label: sanitizeText(payload.label), href: url(payload.href), variant: ['primary', 'secondary', 'ghost'].includes(payload.variant) ? payload.variant : 'primary' };
  } else if (type === BLOCK_TYPES.EMBED) {
    safe.payload = { src: url(payload.src), title: sanitizeText(payload.title), height: Math.min(1000, Math.max(160, Number(payload.height || 360))) };
  }

  return safe;
}

export function serializeLessonDocument(doc = {}, title = '') {
  const normalized = normalizeEditorDocument(doc, title);
  const blocks = (normalized.blocks || []).map((block, index) => sanitizeBlockForSave(block, index));

  return {
    schema_version: 3,
    title: sanitizeText(normalized.title || title),
    blocks,
    metadata: {
      locale: sanitizeText(normalized?.metadata?.locale || 'en'),
      tags: Array.isArray(normalized?.metadata?.tags) ? normalized.metadata.tags.map((tag) => sanitizeText(tag)).filter(Boolean) : [],
      readingMinutes: Number(normalized?.metadata?.readingMinutes || 5),
    },
  };
}

export function emptyBlock(type = BLOCK_TYPES.RICH_TEXT) {
  return sanitizeBlockForSave({ type, payload: {} }, 0);
}
