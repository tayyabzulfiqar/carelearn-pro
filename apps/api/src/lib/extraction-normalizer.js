const { extractImageMarkerFromText, validateMarkerUniqueness } = require('./marker-extraction');

function collapseSpaces(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeDocBlocksToStructured(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) {
    const err = new Error('NORMALIZER_NO_BLOCKS');
    err.code = 'NORMALIZER_NO_BLOCKS';
    throw err;
  }

  let title = null;
  const sections = [];
  let currentSection = null;

  for (const block of blocks) {
    if (block.type === 'heading') {
      const headingText = collapseSpaces(block.text);
      if (!title) {
        title = headingText;
      }
      currentSection = { heading: headingText, blocks: [] };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) {
      const err = new Error('NORMALIZER_CONTENT_BEFORE_FIRST_HEADING');
      err.code = 'NORMALIZER_CONTENT_BEFORE_FIRST_HEADING';
      throw err;
    }

    if (block.type === 'paragraph') {
      const text = collapseSpaces(block.text);
      if (!text) continue;
      const marker = extractImageMarkerFromText(text);
      if (marker) {
        currentSection.blocks.push(marker);
      } else if (text.startsWith('[IMAGE')) {
        const err = new Error(`INVALID_MARKER_SYNTAX: ${text}`);
        err.code = 'INVALID_MARKER_SYNTAX';
        throw err;
      } else {
        currentSection.blocks.push({ type: 'paragraph', text });
      }
    }
  }

  if (!title || !sections.length) {
    const err = new Error('NORMALIZER_NO_SECTIONS');
    err.code = 'NORMALIZER_NO_SECTIONS';
    throw err;
  }

  const allBlocks = sections.flatMap((section) => section.blocks);
  validateMarkerUniqueness(allBlocks);

  for (const section of sections) {
    if (!section.blocks.length) {
      const err = new Error(`NORMALIZER_EMPTY_SECTION: ${section.heading}`);
      err.code = 'NORMALIZER_EMPTY_SECTION';
      throw err;
    }
  }

  return { title, sections };
}

function structuredToNormalizedText(structured) {
  const lines = [structured.title, ''];
  for (const section of structured.sections) {
    lines.push(`## ${section.heading}`);
    for (const block of section.blocks) {
      if (block.type === 'paragraph') lines.push(block.text);
      if (block.type === 'image_marker') {
        const align = block.align ? `_${block.align.toUpperCase()}` : '';
        const marker = align === '_CENTER' ? `[${block.key}]` : `[${block.key}${align}]`;
        lines.push(marker);
      }
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

module.exports = {
  normalizeDocBlocksToStructured,
  structuredToNormalizedText,
};
