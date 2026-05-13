const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTrainingContract,
  validateImageManifest,
  buildValidationResult,
} = require('./training-ingestion-contract');

test('parses deterministic sections and markers into ordered blocks', () => {
  const sourceText = [
    'Fire Safety Awareness',
    '',
    '## Introduction',
    'Intro paragraph one.',
    '[IMAGE_1_RIGHT]',
    '',
    '## Fire Hazards',
    'Hazard text.',
    '[IMAGE_2_CENTER]',
  ].join('\n');

  const parsed = parseTrainingContract({ sourceText });
  assert.equal(parsed.title, 'Fire Safety Awareness');
  assert.equal(parsed.sections.length, 2);
  assert.deepEqual(parsed.sections[0].blocks[1], {
    type: 'image_marker',
    key: 'IMAGE_1',
    align: 'right',
  });
});

test('rejects invalid marker syntax', () => {
  const sourceText = [
    'Title',
    '',
    '## Section',
    '[IMAGE-A]',
  ].join('\n');

  assert.throws(
    () => parseTrainingContract({ sourceText }),
    /INVALID_MARKER_SYNTAX/
  );
});

test('rejects marker outside a section', () => {
  const sourceText = [
    'Title',
    '[IMAGE_1]',
    '## Section',
    'Text',
  ].join('\n');

  assert.throws(
    () => parseTrainingContract({ sourceText }),
    /MARKER_OUTSIDE_SECTION/
  );
});

test('validates image manifest against marker keys', () => {
  const parsed = {
    title: 'A',
    sections: [
      {
        heading: 'S',
        blocks: [{ type: 'image_marker', key: 'IMAGE_1', align: 'center' }],
      },
    ],
  };
  const result = validateImageManifest(parsed, ['IMAGE_1.jpg', 'IMAGE_2.png']);
  assert.equal(result.passed, true);
});

test('fails when marker has no mapped image filename', () => {
  const parsed = {
    title: 'A',
    sections: [
      {
        heading: 'S',
        blocks: [{ type: 'image_marker', key: 'IMAGE_8', align: 'left' }],
      },
    ],
  };
  const result = validateImageManifest(parsed, ['IMAGE_1.jpg']);
  assert.equal(result.passed, false);
  assert.equal(result.errors[0].code, 'MISSING_IMAGE_MAPPING');
});

test('buildValidationResult returns canonical pass/fail envelope', () => {
  const sourceText = 'Title\n\n## Heading\nText';
  const passResult = buildValidationResult({ sourceText, imageFiles: [] });
  assert.equal(passResult.passed, true);
  assert.ok(passResult.canonical);

  const failResult = buildValidationResult({
    sourceText: 'Title\n\n## Heading\n[IMAGE_X]',
    imageFiles: [],
  });
  assert.equal(failResult.passed, false);
  assert.ok(Array.isArray(failResult.errors));
});
