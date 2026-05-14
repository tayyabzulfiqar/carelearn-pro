const test = require('node:test');
const assert = require('node:assert/strict');
const { buildNarrationFromCanonical } = require('./ai-narration-engine');

const canonical = {
  title: 'BLS',
  sections: [
    {
      heading: 'Assessment',
      blocks: [{ type: 'paragraph', text: 'Check responsiveness and breathing.' }],
    },
    {
      heading: 'Action',
      blocks: [{ type: 'paragraph', text: 'Call emergency support immediately.' }],
    },
  ],
};

test('builds deterministic narration sections with ssml and refs', () => {
  const first = buildNarrationFromCanonical({ canonical, trainingId: 'b-1' });
  const second = buildNarrationFromCanonical({ canonical, trainingId: 'b-1' });
  assert.equal(first.sections.length, 2);
  assert.deepEqual(
    first.sections.map((s) => ({ section_index: s.section_index, heading: s.heading, script: s.script, ssml: s.ssml })),
    second.sections.map((s) => ({ section_index: s.section_index, heading: s.heading, script: s.script, ssml: s.ssml }))
  );
  assert.ok(first.audio_manifest.every((a) => a.status === 'script_ready'));
});

test('fails loudly for invalid canonical', () => {
  assert.throws(() => buildNarrationFromCanonical({ canonical: {}, trainingId: 'x' }), /AI_CANONICAL_INVALID|AI_CANONICAL_NO_PARAGRAPHS/);
});
