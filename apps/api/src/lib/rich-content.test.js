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

test('preserves reference citations and reflection prompts during normalization', () => {
  const normalized = normalizeLessonDocument({
    title: 'Reference Lesson',
    content: {
      blocks: [
        {
          type: 'reference_table',
          payload: {
            text: 'Standards',
            citations: [
              { label: 'CQC', href: 'https://www.cqc.org.uk' },
            ],
          },
        },
        {
          type: 'reflection_prompts',
          payload: {
            text: 'Think about the response.',
            prompts: ['What would you do first?'],
            links: [
              { label: 'Local policy', href: '/policies/evacuation' },
            ],
          },
        },
      ],
    },
  });

  assert.deepEqual(normalized.blocks[0].payload.citations, [
    { label: 'CQC', href: 'https://www.cqc.org.uk' },
  ]);
  assert.deepEqual(normalized.blocks[1].payload.prompts, ['What would you do first?']);
  assert.deepEqual(normalized.blocks[1].payload.links, [
    { label: 'Local policy', href: '/policies/evacuation' },
  ]);
});

test('rejects invalid citation hyperlinks in structured content', () => {
  const result = validateLessonDocument({
    title: 'Broken Reference Lesson',
    content: {
      blocks: [
        {
          type: 'reference_table',
          payload: {
            text: 'Standards',
            citations: [
              { label: 'Unsafe link', href: 'javascript:alert(1)' },
            ],
          },
        },
      ],
    },
  });

  assert.equal(result.passed, false);
});
