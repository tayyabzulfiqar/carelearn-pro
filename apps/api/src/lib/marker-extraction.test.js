const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractImageMarkerFromText,
  validateMarkerUniqueness,
} = require('./marker-extraction');

test('extracts valid marker without alignment', () => {
  const marker = extractImageMarkerFromText('[IMAGE_4]');
  assert.deepEqual(marker, { type: 'image_marker', key: 'IMAGE_4', align: 'center' });
});

test('extracts valid marker with alignment', () => {
  const marker = extractImageMarkerFromText('[IMAGE_4_RIGHT]');
  assert.deepEqual(marker, { type: 'image_marker', key: 'IMAGE_4', align: 'right' });
});

test('rejects malformed marker', () => {
  const marker = extractImageMarkerFromText('[IMAGE-X]');
  assert.equal(marker, null);
});

test('fails on duplicate marker keys globally', () => {
  assert.throws(
    () =>
      validateMarkerUniqueness([
        { type: 'image_marker', key: 'IMAGE_1' },
        { type: 'paragraph', text: 'Text' },
        { type: 'image_marker', key: 'IMAGE_1' },
      ]),
    /DUPLICATE_IMAGE_MARKER/
  );
});
