function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function assertCanonical(canonical) {
  if (!canonical || typeof canonical !== 'object') {
    const err = new Error('RENDER_INVALID_CANONICAL');
    err.code = 'RENDER_INVALID_CANONICAL';
    throw err;
  }
  if (!Array.isArray(canonical.sections) || canonical.sections.length === 0) {
    const err = new Error('RENDER_NO_SECTIONS');
    err.code = 'RENDER_NO_SECTIONS';
    throw err;
  }
}

function normalizeImageManifest(imageManifest = {}) {
  const out = {};
  for (const [key, value] of Object.entries(imageManifest || {})) {
    out[String(key || '').toUpperCase()] = String(value || '').trim();
  }
  return out;
}

function renderCanonicalDeterministic({ canonical, imageManifest = {} }) {
  assertCanonical(canonical);
  const normalizedManifest = normalizeImageManifest(imageManifest);
  const sections = [];
  const lessonBlocks = [];
  const htmlParts = ['<article data-render="deterministic-canonical">'];
  let order = 0;

  canonical.sections.forEach((section, sectionIndex) => {
    const heading = String(section.heading || '').trim();
    if (!heading) {
      const err = new Error('RENDER_EMPTY_SECTION_HEADING');
      err.code = 'RENDER_EMPTY_SECTION_HEADING';
      throw err;
    }
    if (!Array.isArray(section.blocks) || section.blocks.length === 0) {
      const err = new Error(`RENDER_EMPTY_SECTION_BLOCKS: ${heading}`);
      err.code = 'RENDER_EMPTY_SECTION_BLOCKS';
      throw err;
    }

    const outSection = {
      index: sectionIndex,
      heading,
      blocks: [],
    };
    htmlParts.push(`<section data-index="${sectionIndex}" class="det-section">`);
    htmlParts.push(`<h2>${escapeHtml(heading)}</h2>`);
    lessonBlocks.push({
      id: `det-h-${sectionIndex}`,
      type: 'heading',
      order: order++,
      payload: { text: heading, level: 2 },
    });

    section.blocks.forEach((block, blockIndex) => {
      if (!block || typeof block !== 'object') {
        const err = new Error(`RENDER_INVALID_BLOCK: ${heading}#${blockIndex}`);
        err.code = 'RENDER_INVALID_BLOCK';
        throw err;
      }

      if (block.type === 'paragraph') {
        const text = String(block.text || '').trim();
        if (!text) {
          const err = new Error(`RENDER_EMPTY_PARAGRAPH: ${heading}#${blockIndex}`);
          err.code = 'RENDER_EMPTY_PARAGRAPH';
          throw err;
        }
        outSection.blocks.push({ type: 'paragraph', text });
        htmlParts.push(`<p>${escapeHtml(text)}</p>`);
        lessonBlocks.push({
          id: `det-p-${sectionIndex}-${blockIndex}`,
          type: 'rich_text',
          order: order++,
          payload: { text },
        });
        return;
      }

      if (block.type === 'image_marker') {
        const key = String(block.key || '').toUpperCase();
        const align = String(block.align || 'center').toLowerCase();
        const src = normalizedManifest[key];
        if (!key || !src) {
          const err = new Error(`RENDER_IMAGE_REF_MISSING: ${key || 'UNKNOWN'}`);
          err.code = 'RENDER_IMAGE_REF_MISSING';
          throw err;
        }
        if (!['left', 'right', 'center'].includes(align)) {
          const err = new Error(`RENDER_IMAGE_ALIGN_INVALID: ${align}`);
          err.code = 'RENDER_IMAGE_ALIGN_INVALID';
          throw err;
        }
        const imageBlock = { type: 'image', key, align, src };
        outSection.blocks.push(imageBlock);
        htmlParts.push(
          `<figure data-marker="${escapeHtml(key)}" data-align="${align}" class="det-image det-align-${align}"><img src="${escapeHtml(src)}" alt="" /></figure>`
        );
        lessonBlocks.push({
          id: `det-i-${sectionIndex}-${blockIndex}`,
          type: 'image',
          order: order++,
          payload: { src, align, alt: '', width: 100 },
        });
        return;
      }

      const err = new Error(`RENDER_UNSUPPORTED_BLOCK_TYPE: ${block.type}`);
      err.code = 'RENDER_UNSUPPORTED_BLOCK_TYPE';
      throw err;
    });

    htmlParts.push('</section>');
    sections.push(outSection);
  });

  htmlParts.push('</article>');
  return {
    title: String(canonical.title || '').trim() || 'Untitled',
    sections,
    lessonBlocks,
    html: htmlParts.join(''),
  };
}

module.exports = {
  renderCanonicalDeterministic,
};

