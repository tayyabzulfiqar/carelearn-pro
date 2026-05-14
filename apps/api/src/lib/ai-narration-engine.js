const { collectCanonicalParagraphs, normalizeText } = require('./ai-content-utils');

function buildNarrationFromCanonical({ canonical, trainingId, language = 'en-GB' }) {
  const items = collectCanonicalParagraphs(canonical);
  const bySection = new Map();
  for (const item of items) {
    const key = `${item.sectionIndex}`;
    if (!bySection.has(key)) {
      bySection.set(key, {
        section_index: item.sectionIndex,
        heading: item.heading,
        lines: [],
      });
    }
    bySection.get(key).lines.push({
      text: normalizeText(item.sentences[0]),
      source_ref: {
        section_index: item.sectionIndex,
        block_index: item.blockIndex,
      },
    });
  }

  const sections = Array.from(bySection.values()).map((section) => ({
    ...section,
    script: [`Section: ${section.heading}.`, ...section.lines.map((l) => l.text)].join(' '),
    ssml: `<speak><p><s>Section: ${section.heading}.</s>${section.lines.map((l) => `<s>${l.text}</s>`).join('')}</p></speak>`,
  }));

  return {
    generated_at: new Date().toISOString(),
    generator: 'deterministic_ai_narration_v1',
    training_id: trainingId,
    language,
    sections,
    audio_manifest: sections.map((section) => ({
      section_index: section.section_index,
      audio_key: `narration_${trainingId}_${section.section_index}`,
      status: 'script_ready',
    })),
  };
}

module.exports = {
  buildNarrationFromCanonical,
};
