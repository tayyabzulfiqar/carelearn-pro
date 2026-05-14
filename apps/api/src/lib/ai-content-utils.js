function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function collectCanonicalParagraphs(canonical) {
  if (!canonical || !Array.isArray(canonical.sections) || canonical.sections.length === 0) {
    throw new Error('AI_CANONICAL_INVALID');
  }

  const items = [];
  canonical.sections.forEach((section, sectionIndex) => {
    if (!section || !Array.isArray(section.blocks)) return;
    const heading = normalizeText(section.heading || `Section ${sectionIndex + 1}`);
    section.blocks.forEach((block, blockIndex) => {
      if (!block || block.type !== 'paragraph') return;
      const text = normalizeText(block.text);
      if (!text) return;
      const sentences = splitSentences(text);
      if (!sentences.length) return;
      items.push({
        heading,
        sectionIndex,
        blockIndex,
        text,
        sentences,
      });
    });
  });

  if (!items.length) throw new Error('AI_CANONICAL_NO_PARAGRAPHS');
  return items;
}

module.exports = {
  normalizeText,
  splitSentences,
  collectCanonicalParagraphs,
};
