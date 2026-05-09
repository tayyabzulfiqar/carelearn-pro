const { randomUUID } = require('crypto');

const LESSON_SCHEMA_VERSION = 3;

const BLOCK_TYPES = Object.freeze({
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
});

const ALLOWED_BLOCK_TYPES = new Set(Object.values(BLOCK_TYPES));

const SAFE_URL_PATTERN = /^(https?:\/\/|\/|#)/i;

function cleanText(value, { max = 5000 } = {}) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  return text.slice(0, max);
}

function safeUrl(value) {
  const url = cleanText(value, { max: 2048 });
  if (!url) return '';
  if (!SAFE_URL_PATTERN.test(url)) return '';
  return url;
}

function normalizeBlockPayload(type, payload = {}) {
  switch (type) {
    case BLOCK_TYPES.HEADING:
      return {
        text: cleanText(payload.text, { max: 240 }),
        level: Math.min(4, Math.max(1, Number(payload.level || 2))),
      };
    case BLOCK_TYPES.RICH_TEXT:
      return {
        text: cleanText(payload.text, { max: 20000 }),
      };
    case BLOCK_TYPES.IMAGE:
      return {
        src: safeUrl(payload.src),
        alt: cleanText(payload.alt, { max: 240 }),
        caption: cleanText(payload.caption, { max: 300 }),
        width: Math.min(100, Math.max(20, Number(payload.width || 100))),
        align: ['left', 'center', 'right'].includes(payload.align) ? payload.align : 'center',
      };
    case BLOCK_TYPES.VIDEO:
      return {
        src: safeUrl(payload.src),
        title: cleanText(payload.title, { max: 240 }),
        provider: cleanText(payload.provider || 'direct', { max: 40 }),
      };
    case BLOCK_TYPES.FILE:
      return {
        href: safeUrl(payload.href),
        label: cleanText(payload.label, { max: 240 }) || 'Download file',
        fileType: cleanText(payload.fileType, { max: 40 }),
      };
    case BLOCK_TYPES.DIVIDER:
      return {
        style: ['solid', 'dashed'].includes(payload.style) ? payload.style : 'solid',
      };
    case BLOCK_TYPES.CALLOUT:
      return {
        tone: ['info', 'warning', 'success', 'danger'].includes(payload.tone) ? payload.tone : 'info',
        title: cleanText(payload.title, { max: 140 }),
        body: cleanText(payload.body, { max: 4000 }),
      };
    case BLOCK_TYPES.QUIZ_EMBED:
      return {
        quizId: cleanText(payload.quizId, { max: 64 }),
        title: cleanText(payload.title, { max: 140 }),
      };
    case BLOCK_TYPES.CTA:
      return {
        label: cleanText(payload.label, { max: 120 }) || 'Continue',
        href: safeUrl(payload.href),
        variant: ['primary', 'secondary', 'ghost'].includes(payload.variant) ? payload.variant : 'primary',
      };
    case BLOCK_TYPES.EMBED:
      return {
        src: safeUrl(payload.src),
        title: cleanText(payload.title, { max: 140 }),
        height: Math.min(1000, Math.max(160, Number(payload.height || 360))),
      };
    default:
      return {};
  }
}

function normalizeBlock(block = {}, index = 0) {
  const type = ALLOWED_BLOCK_TYPES.has(block.type) ? block.type : BLOCK_TYPES.RICH_TEXT;
  const id = cleanText(block.id, { max: 80 }) || randomUUID();
  const order = Number.isFinite(Number(block.order)) ? Number(block.order) : index;

  return {
    id,
    type,
    order,
    payload: normalizeBlockPayload(type, block.payload || {}),
    meta: {
      analyticsKey: cleanText(block.meta?.analyticsKey || `${type}_${index + 1}`, { max: 120 }),
      tags: Array.isArray(block.meta?.tags)
        ? block.meta.tags.map((tag) => cleanText(tag, { max: 40 })).filter(Boolean).slice(0, 12)
        : [],
      aiHints: {
        semanticRole: cleanText(block.meta?.aiHints?.semanticRole || '', { max: 80 }),
        summary: cleanText(block.meta?.aiHints?.summary || '', { max: 280 }),
        difficulty: cleanText(block.meta?.aiHints?.difficulty || '', { max: 32 }),
      },
    },
  };
}

function sectionsToBlocks(sections = []) {
  const blocks = [];
  sections.forEach((section, index) => {
    const heading = cleanText(section.heading || `Section ${index + 1}`, { max: 240 });
    blocks.push(normalizeBlock({ type: BLOCK_TYPES.HEADING, payload: { text: heading, level: 2 } }, blocks.length));

    const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
    paragraphs.forEach((paragraph) => {
      blocks.push(normalizeBlock({ type: BLOCK_TYPES.RICH_TEXT, payload: { text: paragraph } }, blocks.length));
    });

    const bullets = Array.isArray(section.bullets)
      ? section.bullets
      : (Array.isArray(section.bullet_points) ? section.bullet_points : []);
    if (bullets.length) {
      blocks.push(normalizeBlock({
        type: BLOCK_TYPES.CALLOUT,
        payload: {
          tone: 'info',
          title: 'Key points',
          body: bullets.map((item) => `- ${cleanText(item, { max: 400 })}`).join('\n'),
        },
      }, blocks.length));
    }

    if (section.image) {
      const image = typeof section.image === 'string' ? { src: section.image } : section.image;
      blocks.push(normalizeBlock({ type: BLOCK_TYPES.IMAGE, payload: image }, blocks.length));
    }
  });
  return blocks;
}

function normalizeLessonDocument({ title, content = {} }) {
  const parsed = typeof content === 'string' ? JSON.parse(content || '{}') : (content || {});

  let blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  if (!blocks.length && Array.isArray(parsed.sections)) {
    blocks = sectionsToBlocks(parsed.sections);
  }
  if (!blocks.length && parsed.body) {
    blocks = [normalizeBlock({ type: BLOCK_TYPES.RICH_TEXT, payload: { text: parsed.body } })];
  }

  const normalizedBlocks = blocks
    .map((block, index) => normalizeBlock(block, index))
    .sort((a, b) => a.order - b.order)
    .map((block, idx) => ({ ...block, order: idx }));

  return {
    schema_version: LESSON_SCHEMA_VERSION,
    title: cleanText(parsed.title || title, { max: 255 }),
    blocks: normalizedBlocks,
    metadata: {
      locale: cleanText(parsed.metadata?.locale || 'en', { max: 10 }),
      readingMinutes: Math.max(1, Number(parsed.metadata?.readingMinutes || 5)),
      tags: Array.isArray(parsed.metadata?.tags)
        ? parsed.metadata.tags.map((tag) => cleanText(tag, { max: 40 })).filter(Boolean).slice(0, 20)
        : [],
      aiReady: {
        vectorizableText: normalizedBlocks
          .map((block) => {
            if (block.type === BLOCK_TYPES.HEADING) return block.payload.text;
            if (block.type === BLOCK_TYPES.RICH_TEXT) return block.payload.text;
            if (block.type === BLOCK_TYPES.CALLOUT) return `${block.payload.title} ${block.payload.body}`;
            return '';
          })
          .filter(Boolean)
          .join('\n'),
        extractionVersion: 1,
      },
    },
  };
}

function validateLessonDocument({ title, content = {} }) {
  const normalized = normalizeLessonDocument({ title, content });
  const blocks = normalized.blocks;

  const checks = {
    hasTitle: Boolean(normalized.title),
    hasBlocks: blocks.length > 0,
    allowedTypes: blocks.every((block) => ALLOWED_BLOCK_TYPES.has(block.type)),
    hasReadableText: blocks.some((block) => (
      (block.type === BLOCK_TYPES.RICH_TEXT && block.payload.text.length >= 20)
      || (block.type === BLOCK_TYPES.HEADING && block.payload.text.length >= 3)
      || (block.type === BLOCK_TYPES.CALLOUT && block.payload.body.length >= 20)
    )),
    safeEmbeds: blocks
      .filter((block) => [BLOCK_TYPES.IMAGE, BLOCK_TYPES.VIDEO, BLOCK_TYPES.EMBED, BLOCK_TYPES.FILE, BLOCK_TYPES.CTA].includes(block.type))
      .every((block) => {
        const url = block.payload.src || block.payload.href || '';
        return !url || SAFE_URL_PATTERN.test(url);
      }),
  };

  return {
    normalized,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

function markdownToBlocks(markdown = '') {
  const lines = String(markdown || '').split(/\r?\n/);
  const blocks = [];
  let paragraphBuffer = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    blocks.push(normalizeBlock({
      type: BLOCK_TYPES.RICH_TEXT,
      payload: { text: paragraphBuffer.join(' ').trim() },
    }, blocks.length));
    paragraphBuffer = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      return;
    }

    if (/^#{1,4}\s+/.test(trimmed)) {
      flushParagraph();
      const headingLevel = trimmed.match(/^#+/)[0].length;
      blocks.push(normalizeBlock({
        type: BLOCK_TYPES.HEADING,
        payload: { text: trimmed.replace(/^#{1,4}\s+/, ''), level: headingLevel },
      }, blocks.length));
      return;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      const existing = blocks[blocks.length - 1];
      if (existing && existing.type === BLOCK_TYPES.CALLOUT && existing.payload.title === 'Key points') {
        existing.payload.body = `${existing.payload.body}\n${trimmed}`;
      } else {
        blocks.push(normalizeBlock({
          type: BLOCK_TYPES.CALLOUT,
          payload: { tone: 'info', title: 'Key points', body: trimmed },
        }, blocks.length));
      }
      return;
    }

    paragraphBuffer.push(trimmed);
  });

  flushParagraph();
  return blocks;
}

module.exports = {
  LESSON_SCHEMA_VERSION,
  BLOCK_TYPES,
  ALLOWED_BLOCK_TYPES,
  normalizeLessonDocument,
  validateLessonDocument,
  markdownToBlocks,
};
