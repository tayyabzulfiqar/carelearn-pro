const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSummaryFromCanonical } = require('./ai-summary-engine');

const canonical = {
  title: 'Dementia Care',
  sections: [
    {
      heading: 'Communication',
      blocks: [
        { type: 'paragraph', text: 'Always speak calmly and clearly.' },
        { type: 'paragraph', text: 'Never rush responses from residents.' },
      ],
    },
    {
      heading: 'Escalation',
      blocks: [
        { type: 'paragraph', text: 'Warning: report sudden behavioral risk to the nurse in charge.' },
      ],
    },
  ],
};

test('builds deterministic summary derived from canonical only', () => {
  const first = buildSummaryFromCanonical({ canonical, trainingId: 'd-1' });
  const second = buildSummaryFromCanonical({ canonical, trainingId: 'd-1' });
  assert.equal(first.quick_summary, second.quick_summary);
  assert.deepEqual(first.key_points, second.key_points);
  assert.ok(first.important_warnings.length >= 1);
  assert.ok(first.key_points.every((p) => p.source_ref && Number.isInteger(p.source_ref.section_index)));
});

test('fails loudly for invalid canonical', () => {
  assert.throws(() => buildSummaryFromCanonical({ canonical: null, trainingId: 'x' }), /AI_CANONICAL_INVALID/);
});
