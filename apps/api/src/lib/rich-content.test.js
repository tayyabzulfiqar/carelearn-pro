const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLessonDocument,
  validateLessonDocument,
  markdownToBlocks,
  BLOCK_TYPES,
} = require('./rich-content');

test('normalizes sections into ordered blocks', () => {
  const normalized = normalizeLessonDocument({
    title: 'Demo Lesson',
    content: {
      sections: [
        { heading: 'Heading One', paragraphs: ['Paragraph one with enough length to pass readability check.'] },
      ],
    },
  });

  assert.equal(normalized.schema_version, 3);
  assert.ok(normalized.blocks.length >= 2);
  assert.equal(normalized.blocks[0].type, BLOCK_TYPES.HEADING);
});

test('rejects unsafe javascript URLs', () => {
  const result = validateLessonDocument({
    title: 'Unsafe Embed',
    content: {
      blocks: [{ type: 'embed', payload: { src: 'javascript:alert(1)' } }],
    },
  });

  assert.equal(result.passed, false);
});

test('markdown conversion returns block objects', () => {
  const blocks = markdownToBlocks('## Intro\n\ntext block\n\n- bullet');
  assert.ok(Array.isArray(blocks));
  assert.ok(blocks.length >= 2);
});

test('preserves pdf_document payload', () => {
  const normalized = normalizeLessonDocument({
    title: 'PDF Lesson',
    content: {
      blocks: [
        {
          type: 'pdf_document',
          payload: {
            url: '/uploads/media/abc123.pdf',
            filename: 'abc123.pdf',
            mimeType: 'application/pdf',
          },
        },
      ],
    },
  });

  assert.equal(normalized.blocks[0].type, 'pdf_document');
  assert.equal(normalized.blocks[0].payload.url, '/uploads/media/abc123.pdf');
  assert.equal(normalized.blocks[0].payload.mimeType, 'application/pdf');
});
