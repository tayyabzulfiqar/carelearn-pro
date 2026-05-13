const mammoth = require('mammoth');

function decodeHtmlEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(text) {
  return decodeHtmlEntities(String(text || '').replace(/<[^>]*>/g, '').trim());
}

function extractBlocksFromMammothHtml(html) {
  const blocks = [];
  const pattern = /<(h[1-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match = pattern.exec(html);
  while (match) {
    const tag = match[1].toLowerCase();
    const text = stripTags(match[2]);
    if (text) {
      if (tag === 'p') {
        blocks.push({ type: 'paragraph', text });
      } else {
        blocks.push({ type: 'heading', level: Number(tag.slice(1)), text });
      }
    }
    match = pattern.exec(html);
  }
  return blocks;
}

function validateDocxBlockStructure(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    const err = new Error('DOCX_NO_BLOCKS');
    err.code = 'DOCX_NO_BLOCKS';
    throw err;
  }
  const firstHeadingIndex = blocks.findIndex((block) => block.type === 'heading');
  if (firstHeadingIndex < 0) {
    const err = new Error('DOCX_NO_HEADINGS');
    err.code = 'DOCX_NO_HEADINGS';
    throw err;
  }
  if (firstHeadingIndex > 0) {
    const err = new Error('DOCX_CONTENT_BEFORE_FIRST_HEADING');
    err.code = 'DOCX_CONTENT_BEFORE_FIRST_HEADING';
    throw err;
  }
}

async function extractDocxStructured({ buffer }) {
  try {
    const { value } = await mammoth.convertToHtml({ buffer });
    const blocks = extractBlocksFromMammothHtml(value);
    validateDocxBlockStructure(blocks);
    return { blocks };
  } catch (error) {
    if (error && error.code && String(error.code).startsWith('DOCX_')) {
      throw error;
    }
    const err = new Error(`DOCX_EXTRACTION_FAILED: ${error.message}`);
    err.code = 'DOCX_EXTRACTION_FAILED';
    throw err;
  }
}

module.exports = {
  extractBlocksFromMammothHtml,
  validateDocxBlockStructure,
  extractDocxStructured,
};
