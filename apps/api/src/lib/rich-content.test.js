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
