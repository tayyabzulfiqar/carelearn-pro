const test = require('node:test');
const assert = require('node:assert/strict');
const { adaptExtractedBlocksToCanonical } = require('./ingestion-contract-adapter');

test('adapts extracted blocks to layer2a canonical json deterministically', () => {
  const result = adaptExtractedBlocksToCanonical({
    blocks: [
      { type: 'heading', level: 1, text: 'Fire Safety' },
      { type: 'paragraph', text: 'Intro text' },
      { type: 'paragraph', text: '[IMAGE_1_RIGHT]' },
    ],
    imageFiles: ['IMAGE_1.jpg'],
  });
  assert.equal(result.canonical.sections.length, 1);
  assert.equal(result.canonical.sections[0].blocks[1].type, 'image_marker');
});

test('fails when image mapping is missing', () => {
  assert.throws(
    () =>
      adaptExtractedBlocksToCanonical({
        blocks: [
          { type: 'heading', level: 1, text: 'Title' },
          { type: 'paragraph', text: '[IMAGE_9]' },
        ],
        imageFiles: [],
      }),
    /CONTRACT_ADAPTER_VALIDATION_FAILED/
  );
});
