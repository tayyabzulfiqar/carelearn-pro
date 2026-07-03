const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
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
  PDF_DOCUMENT: 'pdf_document',
};

const EXTENDED_BLOCK_TYPES = new Set([
  ...Object.values(BLOCK_TYPES),
  'bullet_list',
  'image_slot',
  'key_information',
  'warning_box',
  'critical_information',
  'best_practice',
  'important_note',
  'step_list',
  'summary',
  'objective_list',
  'reflection_prompts',
  'reference_table',
  'quiz_point',
]);

const SAFE_URL = /^(https?:\/\/|\/|#)/i;

const IMAGE_BLOCK_TYPES = new Set(['image', 'image_slot']);
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'how', 'in', 'into',
  'is', 'it', 'its', 'of', 'on', 'or', 'our', 'the', 'their', 'this', 'to', 'with', 'you', 'your',
  'about', 'after', 'before', 'can', 'do', 'does', 'guide', 'guidance', 'lesson', 'module', 'section',
  'what', 'why', 'when', 'where', 'who', 'which',
]);

function normalizeWord(word = '') {
  return String(word).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function tokenizeForPresentation(text = '') {
  return String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map(normalizeWord)
    .filter((word) => word && word.length > 2 && !STOPWORDS.has(word));
}

function collectBlockText(block = {}) {
  const payload = block.payload || {};
  const parts = [];

  if (block.type === BLOCK_TYPES.HEADING) {
    parts.push(payload.text);
  } else if (block.type === BLOCK_TYPES.RICH_TEXT) {
    parts.push(payload.text);
  } else if (block.type === BLOCK_TYPES.IMAGE) {
    parts.push(payload.alt, payload.caption, payload.src);
  } else if (block.type === BLOCK_TYPES.VIDEO) {
    parts.push(payload.title, payload.src);
  } else if (block.type === BLOCK_TYPES.FILE) {
    parts.push(payload.label, payload.fileType, payload.href);
  } else if (block.type === BLOCK_TYPES.CALLOUT) {
    parts.push(payload.title, payload.body);
  } else if (block.type === BLOCK_TYPES.QUIZ_EMBED) {
    parts.push(payload.title, payload.quizId);
  } else if (block.type === BLOCK_TYPES.CTA) {
    parts.push(payload.label, payload.href);
  } else if (block.type === BLOCK_TYPES.EMBED) {
    parts.push(payload.title, payload.src);
  } else if (block.type === BLOCK_TYPES.PDF_DOCUMENT) {
    parts.push(payload.filename, payload.label, payload.url);
  } else if (block.type === 'objective_list') {
    parts.push(Array.isArray(payload.objectives) ? payload.objectives.join(' ') : payload.text);
  } else if (block.type === 'summary' || block.type === 'reflection_prompts' || block.type === 'reference_table' || block.type === 'key_information' || block.type === 'warning_box' || block.type === 'critical_information' || block.type === 'best_practice' || block.type === 'important_note' || block.type === 'step_list' || block.type === 'quiz_point') {
    parts.push(payload.text, payload.question, payload.rationale);
  } else if (block.type === 'image_slot') {
    parts.push(payload.imageId, payload.alt, payload.caption, payload.cdnUrl);
  } else if (block.type === 'bullet_list') {
    parts.push(Array.isArray(payload.items) ? payload.items.join(' ') : payload.text);
  }

  return parts.filter(Boolean).join(' ');
}

function isImageBlock(block = {}) {
  return IMAGE_BLOCK_TYPES.has(String(block?.type || '').toLowerCase());
}

function getBlockOrder(block = {}, fallbackIndex = 0) {
  const order = Number(block?.order);
  return Number.isFinite(order) ? order : fallbackIndex;
}

function scorePresentationAnchor(imageTokens, imageContextTokens, anchor) {
  if (!anchor) return -Infinity;
  const anchorTokens = anchor.tokens;
  if (!anchorTokens.length) return -Infinity;

  const directOverlap = anchorTokens.filter((token) => imageTokens.includes(token)).length;
  const contextOverlap = anchor.contextTokens.filter((token) => imageTokens.includes(token)).length;
  const contextBoost = imageContextTokens.filter((token) => anchorTokens.includes(token)).length;
  const typeWeight = anchor.block.type === BLOCK_TYPES.HEADING ? 0.75 : 1;
  const isShortHeading = anchor.block.type === BLOCK_TYPES.HEADING && anchorTokens.length <= 5 ? 0.25 : 0;

  return (directOverlap * 4) + (contextOverlap * 1.25) + (contextBoost * 0.5) + typeWeight + isShortHeading;
}

export function prepareLessonPresentationBlocks(blocks = []) {
  if (!Array.isArray(blocks) || blocks.length < 2) return Array.isArray(blocks) ? [...blocks] : [];

  const normalized = blocks.map((block, index) => ({
    block,
    index,
    order: getBlockOrder(block, index),
  })).sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry, position) => ({ ...entry, position }));

  const anchors = [];
  let currentSection = null;

  normalized.forEach((entry) => {
    const block = entry.block || {};
    if (isImageBlock(block)) return;

    if (block.type === BLOCK_TYPES.HEADING || !currentSection) {
      currentSection = {
        id: `${entry.order}-${entry.index}`,
        heading: block.type === BLOCK_TYPES.HEADING ? collectBlockText(block) : '',
        tokens: tokenizeForPresentation(collectBlockText(block)),
        contextTokens: [],
      };
    }

    const blockText = collectBlockText(block);
    const blockTokens = tokenizeForPresentation(blockText);
    const sectionTokens = tokenizeForPresentation(`${currentSection.heading} ${blockText}`);
    currentSection.contextTokens = Array.from(new Set([...currentSection.contextTokens, ...sectionTokens]));

    anchors.push({
      block,
      index: entry.index,
      position: entry.position,
      order: entry.order,
      tokens: blockTokens,
      contextTokens: sectionTokens,
    });
  });

  if (!anchors.length) return [...blocks];

  const assignments = new Map();
  const usedAnchorPositions = new Set();
  let minAnchorIndex = 0;

  normalized
    .filter((entry) => isImageBlock(entry.block))
    .forEach((entry) => {
      const block = entry.block || {};
      const imageTokens = tokenizeForPresentation(collectBlockText(block));
      const imageContextTokens = tokenizeForPresentation(`${collectBlockText(block)} ${blocks.map((item) => collectBlockText(item)).join(' ')}`);
      // Prefer anchors at or after the last placement, and never reuse an anchor that
      // already holds an image, so two images are never rendered back-to-back and each
      // image stays separated by lesson content.
      const forwardAnchors = anchors.filter((anchor) => anchor.position >= minAnchorIndex && !usedAnchorPositions.has(anchor.position));
      const freeAnchors = anchors.filter((anchor) => !usedAnchorPositions.has(anchor.position));
      const pool = forwardAnchors.length ? forwardAnchors : (freeAnchors.length ? freeAnchors : anchors);

      let bestAnchor = pool[0];
      let bestScore = -Infinity;

      pool.forEach((anchor) => {
        const score = scorePresentationAnchor(imageTokens, imageContextTokens, anchor);
        if (score > bestScore || (score === bestScore && anchor.position < (bestAnchor?.position ?? Infinity))) {
          bestScore = score;
          bestAnchor = anchor;
        }
      });

      if (!bestAnchor) bestAnchor = anchors[anchors.length - 1];
      if (!assignments.has(bestAnchor.position)) assignments.set(bestAnchor.position, []);
      assignments.get(bestAnchor.position).push(entry.block);
      usedAnchorPositions.add(bestAnchor.position);
      minAnchorIndex = bestAnchor.position + 1;
    });

  const presented = [];
  normalized.forEach((entry) => {
    if (isImageBlock(entry.block)) return;
    presented.push(entry.block);
    const attachedImages = assignments.get(entry.position) || [];
    attachedImages.forEach((imageBlock) => presented.push(imageBlock));
  });

  return presented;
}

export function resolveAssetUrl(input = '') {
  if (!input || typeof input !== 'string') return '';
  if (input.startsWith('http://') || input.startsWith('https://')) return input;
  if (input.startsWith('/certificates')) return `${API_ORIGIN}${input}`;
  if (input.startsWith('/api/v1')) return `${API_BASE}${input.replace(/^\/api\/v1/, '')}`;
  if (input.startsWith('/uploads')) return `${API_BASE}${input}`;
  // Static course assets served from Next.js public/ — pass through as-is
  if (input.startsWith('/bls/')) return input;
  if (input.startsWith('/course-assets/')) return input;
  return `${API_BASE}${input.startsWith('/') ? input : `/${input}`}`;
}

function normalizeLegacyStepList(block = {}) {
  const payload = block.payload || {};
  const rawSteps = Array.isArray(payload.steps) ? payload.steps : (Array.isArray(block.steps) ? block.steps : []);
  return {
    steps: rawSteps
      .map((step) => (typeof step === 'string' ? step : sanitizeText(step?.text || step?.title || '')))
      .filter(Boolean),
    text: sanitizeText(payload.text || block.text || ''),
  };
}

function normalizeBlockPayload(type, block = {}) {
  const payload = block.payload || {};

  if (type === BLOCK_TYPES.HEADING) {
    return {
      text: sanitizeText(payload.text || block.text),
      level: Math.min(4, Math.max(1, Number(payload.level || block.level || 2))),
    };
  }
  if (type === BLOCK_TYPES.RICH_TEXT) {
    return { text: sanitizeText(payload.text || block.text || block.content) };
  }
  if (type === 'bullet_list') {
    return {
      items: (Array.isArray(payload.items) ? payload.items : (Array.isArray(block.items) ? block.items : []))
        .map((item) => sanitizeText(item))
        .filter(Boolean),
    };
  }
  if (type === BLOCK_TYPES.IMAGE) {
    return {
      src: sanitizeText(payload.src || block.src),
      alt: sanitizeText(payload.alt || block.alt),
      caption: sanitizeText(payload.caption || block.caption),
      width: Math.min(100, Math.max(20, Number(payload.width || block.width || 100))),
      align: ['left', 'center', 'right'].includes(payload.align || block.align) ? (payload.align || block.align) : 'center',
    };
  }
  if (type === 'step_list') return normalizeLegacyStepList(block);
  if (type === 'objective_list') {
    return {
      objectives: (Array.isArray(payload.objectives) ? payload.objectives : (Array.isArray(block.items) ? block.items : []))
        .map((item) => sanitizeText(item))
        .filter(Boolean),
      text: sanitizeText(payload.text || block.text || ''),
    };
  }
  if (type === 'key_information' || type === 'warning_box' || type === 'critical_information' || type === 'best_practice' || type === 'important_note') {
    return {
      text: sanitizeText(payload.text || block.text || block.content),
      tone: sanitizeText(payload.tone || block.tone || ''),
    };
  }
  if (type === 'summary' || type === 'reflection_prompts' || type === 'reference_table') {
    return { text: sanitizeText(payload.text || block.text || block.content) };
  }
  if (type === 'image_slot') {
    return {
      imageId: sanitizeText(payload.imageId || block.imageId),
      position: sanitizeText(payload.position || block.position),
      ratio: sanitizeText(payload.ratio || block.ratio),
      frameStyle: sanitizeText(payload.frameStyle || block.frameStyle),
      alignment: sanitizeText(payload.alignment || block.alignment),
      cdnUrl: sanitizeText(payload.cdnUrl || block.cdnUrl),
      resolutionStatus: sanitizeText(payload.resolutionStatus || block.resolutionStatus),
      isSequentialSet: Boolean(payload.isSequentialSet || block.isSequentialSet),
      sequentialSetKey: sanitizeText(payload.sequentialSetKey || block.sequentialSetKey),
      sequentialSetIncomplete: Boolean(payload.sequentialSetIncomplete || block.sequentialSetIncomplete),
    };
  }
  if (type === 'quiz_point') {
    return {
      question: sanitizeText(payload.question || block.question),
      options: (Array.isArray(payload.options) ? payload.options : (Array.isArray(block.options) ? block.options : []))
        .map((item) => sanitizeText(item))
        .filter(Boolean),
      correct: Number.isFinite(Number(payload.correct ?? block.correct)) ? Number(payload.correct ?? block.correct) : 0,
      rationale: sanitizeText(payload.rationale || block.rationale),
    };
  }
  if (type === BLOCK_TYPES.PDF_DOCUMENT) {
    return {
      url: sanitizeText(payload.url || payload.href || block.url || block.href),
      filename: sanitizeText(payload.filename || payload.fileName || block.filename || block.fileName || block.label || 'Document.pdf'),
      mimeType: sanitizeText(payload.mimeType || block.mimeType || 'application/pdf'),
    };
  }

  return payload;
}

export function normalizeLessonBlock(block = {}, index = 0) {
  const legacyTypeMap = {
    paragraph: BLOCK_TYPES.RICH_TEXT,
    hero_image: BLOCK_TYPES.IMAGE,
    numbered_steps: 'step_list',
    learning_objectives: 'objective_list',
    info_box: 'key_information',
  };

  const resolvedType = legacyTypeMap[block?.type] || block?.type || BLOCK_TYPES.RICH_TEXT;
  const type = EXTENDED_BLOCK_TYPES.has(resolvedType) ? resolvedType : BLOCK_TYPES.RICH_TEXT;

  return {
    ...block,
    id: String(block?.id || `block-${index}`),
    type,
    order: getBlockOrder(block, index),
    payload: normalizeBlockPayload(type, block),
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
}

export function normalizeEditorDocument(content = {}, title = '') {
  const parsed = typeof content === 'string' ? JSON.parse(content || '{}') : (content || {});
  const blocks = Array.isArray(parsed.blocks) ? parsed.blocks.map((block, index) => normalizeLessonBlock(block, index)) : [];

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
    blocks: blocks.sort((a, b) => getBlockOrder(a, 0) - getBlockOrder(b, 0)),
    metadata: parsed.metadata || {},
  };
}

export function sanitizeText(value = '') {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

export function sanitizeBlockForSave(block, index = 0) {
  const normalized = normalizeLessonBlock(block, index);
  const type = normalized.type;
  const payload = normalized.payload || {};

  const safe = {
    id: String(normalized.id || `block-${Date.now()}-${index}`),
    type,
    order: index,
    payload: {},
    meta: {
      analyticsKey: sanitizeText(normalized?.meta?.analyticsKey || `${type}_${index + 1}`),
      tags: Array.isArray(normalized?.meta?.tags) ? normalized.meta.tags.map((tag) => sanitizeText(tag)).filter(Boolean) : [],
      aiHints: {
        semanticRole: sanitizeText(normalized?.meta?.aiHints?.semanticRole || ''),
        summary: sanitizeText(normalized?.meta?.aiHints?.summary || ''),
        difficulty: sanitizeText(normalized?.meta?.aiHints?.difficulty || ''),
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
  } else if (type === BLOCK_TYPES.PDF_DOCUMENT) {
    safe.payload = {
      url: url(payload.url || payload.href),
      filename: sanitizeText(payload.filename || payload.fileName || payload.label || 'Document.pdf'),
      mimeType: sanitizeText(payload.mimeType || 'application/pdf'),
    };
  } else if (type === 'bullet_list') {
    safe.payload = {
      items: Array.isArray(payload.items) ? payload.items.map((item) => sanitizeText(item)).filter(Boolean) : [],
    };
  } else if (type === 'step_list') {
    safe.payload = {
      steps: Array.isArray(payload.steps) ? payload.steps.map((step) => sanitizeText(step)).filter(Boolean) : [],
      text: sanitizeText(payload.text),
    };
  } else if (type === 'objective_list') {
    safe.payload = {
      objectives: Array.isArray(payload.objectives) ? payload.objectives.map((item) => sanitizeText(item)).filter(Boolean) : [],
      text: sanitizeText(payload.text),
    };
  } else if (type === 'key_information' || type === 'warning_box' || type === 'critical_information' || type === 'best_practice' || type === 'important_note') {
    safe.payload = {
      text: sanitizeText(payload.text),
      tone: sanitizeText(payload.tone),
    };
  } else if (type === 'summary' || type === 'reflection_prompts' || type === 'reference_table') {
    safe.payload = {
      text: sanitizeText(payload.text),
    };
  } else if (type === 'image_slot') {
    safe.payload = {
      imageId: sanitizeText(payload.imageId),
      position: sanitizeText(payload.position || 'full_width'),
      ratio: sanitizeText(payload.ratio || '16:9'),
      frameStyle: sanitizeText(payload.frameStyle || 'none'),
      alignment: sanitizeText(payload.alignment || 'center'),
      cdnUrl: url(payload.cdnUrl),
      resolutionStatus: sanitizeText(payload.resolutionStatus || 'unresolved'),
      isSequentialSet: Boolean(payload.isSequentialSet),
      sequentialSetKey: sanitizeText(payload.sequentialSetKey),
      sequentialSetIncomplete: Boolean(payload.sequentialSetIncomplete),
    };
  } else if (type === 'quiz_point') {
    safe.payload = {
      question: sanitizeText(payload.question),
      options: Array.isArray(payload.options) ? payload.options.map((item) => sanitizeText(item)).filter(Boolean) : [],
      correct: Number.isFinite(Number(payload.correct)) ? Number(payload.correct) : 0,
      rationale: sanitizeText(payload.rationale),
    };
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
