const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStrictPdfTextToBlocks, extractPdfStructured } = require('./pdf-structure-extractor');

test('parses strict heading lines from extracted pdf text', () => {
  const blocks = parseStrictPdfTextToBlocks('## Intro\nText line\n## Next\nMore text');
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'paragraph');
});

test('fails on OCR ambiguity glyph', () => {
  assert.throws(
    () => parseStrictPdfTextToBlocks('## Intro\nBad \uFFFD text'),
    /PDF_OCR_AMBIGUITY/
  );
});

test('fails on detached glyph extraction ambiguity', () => {
  assert.throws(
    () => parseStrictPdfTextToBlocks('## Intro\nB a d\ng l y p h'),
    /PDF_OCR_AMBIGUITY/
  );
});

test('fails on consecutive single-letter line ambiguity', () => {
  assert.throws(
    () => parseStrictPdfTextToBlocks('## Intro\nB\na\nd\ng\nl\ny\np\nh'),
    /PDF_OCR_AMBIGUITY/
  );
});

test('fails malformed/invalid pdf buffer hard', async () => {
  await assert.rejects(
    () => extractPdfStructured({ buffer: Buffer.from('not-a-pdf') }),
    /PDF_EXTRACTION_FAILED/
  );
});
