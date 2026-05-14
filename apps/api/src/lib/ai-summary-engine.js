const { collectCanonicalParagraphs, normalizeText } = require('./ai-content-utils');

function buildSummaryFromCanonical({ canonical, trainingId }) {
  const items = collectCanonicalParagraphs(canonical);
  const top = items.slice(0, 6);
  const warnings = items
    .flatMap((item) => item.sentences.map((sentence) => ({ ...item, sentence })))
    .filter((item) => /(warning|risk|never|must|always|urgent|critical|danger)/i.test(item.sentence))
    .slice(0, 3);

  const keyPoints = top.slice(0, 5).map((item) => ({
    text: normalizeText(item.sentences[0]),
    source_ref: {
      section_index: item.sectionIndex,
      block_index: item.blockIndex,
      heading: item.heading,
    },
  }));

  const recapSentences = top
    .slice(0, 4)
    .map((item) => normalizeText(item.sentences[0]))
    .join(' ');

  return {
    generated_at: new Date().toISOString(),
    generator: 'deterministic_ai_summary_v1',
    training_id: trainingId,
    quick_summary: keyPoints.map((p) => p.text).join(' '),
    key_points: keyPoints,
    revision_mode: keyPoints.map((p, idx) => `${idx + 1}. ${p.text}`),
    recap_5_min: recapSentences,
    important_warnings: warnings.map((item) => ({
      text: normalizeText(item.sentence),
      source_ref: {
        section_index: item.sectionIndex,
        block_index: item.blockIndex,
        heading: item.heading,
      },
    })),
    common_mistakes: warnings.map((item) => ({
      text: `Avoid ignoring: ${normalizeText(item.sentence)}`,
      source_ref: {
        section_index: item.sectionIndex,
        block_index: item.blockIndex,
        heading: item.heading,
      },
    })),
  };
}

module.exports = {
  buildSummaryFromCanonical,
};
