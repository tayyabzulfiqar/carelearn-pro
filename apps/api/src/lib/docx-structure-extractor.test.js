const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractBlocksFromMammothHtml,
  validateDocxBlockStructure,
  extractDocxStructured,
} = require('./docx-structure-extractor');

test('extracts ordered heading and paragraph blocks from mammoth html', () => {
  const html = '<h1>Fire Safety</h1><p>Intro text.</p><h2>Risks</h2><p>Risk details.</p>';
  const blocks = extractBlocksFromMammothHtml(html);
  assert.deepEqual(blocks, [
    { type: 'heading', level: 1, text: 'Fire Safety' },
    { type: 'paragraph', text: 'Intro text.' },
    { type: 'heading', level: 2, text: 'Risks' },
    { type: 'paragraph', text: 'Risk details.' },
  ]);
});

test('fails when document has content before first heading', () => {
  const blocks = [
    { type: 'paragraph', text: 'Preface text' },
    { type: 'heading', level: 1, text: 'H1' },
  ];
  assert.throws(
    () => validateDocxBlockStructure(blocks),
    /DOCX_CONTENT_BEFORE_FIRST_HEADING/
  );
});

test('fails when document has no headings', () => {
  const blocks = [{ type: 'paragraph', text: 'Only paragraph' }];
  assert.throws(
    () => validateDocxBlockStructure(blocks),
    /DOCX_NO_HEADINGS/
  );
});

test('fails malformed docx buffer', async () => {
  await assert.rejects(
    () => extractDocxStructured({ buffer: Buffer.from('not-a-docx') }),
    /DOCX_EXTRACTION_FAILED/
  );
});
