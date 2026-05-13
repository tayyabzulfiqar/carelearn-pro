const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDocBlocksToStructured, structuredToNormalizedText } = require('./extraction-normalizer');

test('normalizes blocks deterministically and preserves ordering', () => {
  const structured = normalizeDocBlocksToStructured([
    { type: 'heading', level: 1, text: ' Fire  Safety ' },
    { type: 'paragraph', text: ' Intro    text ' },
    { type: 'paragraph', text: '[IMAGE_1_RIGHT]' },
    { type: 'heading', level: 2, text: 'Hazards' },
    { type: 'paragraph', text: ' Hazard details ' },
  ]);
  assert.equal(structured.sections.length, 2);
  assert.equal(structured.sections[0].blocks[0].text, 'Intro text');
  assert.equal(structured.sections[0].blocks[1].key, 'IMAGE_1');
});

test('fails on malformed marker paragraph', () => {
  assert.throws(
    () =>
      normalizeDocBlocksToStructured([
        { type: 'heading', level: 1, text: 'Title' },
        { type: 'paragraph', text: '[IMAGE-X]' },
      ]),
    /INVALID_MARKER_SYNTAX/
  );
});

test('fails on duplicate markers globally', () => {
  assert.throws(
    () =>
      normalizeDocBlocksToStructured([
        { type: 'heading', level: 1, text: 'Title' },
        { type: 'paragraph', text: '[IMAGE_1]' },
        { type: 'heading', level: 2, text: 'Next' },
        { type: 'paragraph', text: '[IMAGE_1_RIGHT]' },
      ]),
    /DUPLICATE_IMAGE_MARKER/
  );
});

test('normalized text generation is deterministic for same input', () => {
  const structured = normalizeDocBlocksToStructured([
    { type: 'heading', level: 1, text: 'Title' },
    { type: 'paragraph', text: 'Text' },
    { type: 'paragraph', text: '[IMAGE_1_CENTER]' },
  ]);
  const a = structuredToNormalizedText(structured);
  const b = structuredToNormalizedText(structured);
  assert.equal(a, b);
});
