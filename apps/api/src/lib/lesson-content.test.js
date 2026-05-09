const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLessonContent,
  validateStructuredLessonContent,
} = require('./lesson-content');

const { markdownToBlocks } = require('./rich-content');

test('normalizes legacy section lesson content into schema v3 blocks', () => {
  const normalized = normalizeLessonContent({
    title: 'Learning Outcomes',
    content: {
      schema_version: 2,
      sections: [
        {
          heading: 'Fire safety responsibilities',
          paragraphs: ['Staff must raise the alarm and follow the evacuation plan.'],
          bullets: ['Keep escape routes clear'],
        },
        {
          heading: 'Resident support',
          paragraphs: ['Residents may need support according to their personal evacuation plan.'],
          bullets: ['Close doors behind you'],
        },
      ],
    },
  });

  assert.equal(normalized.title, 'Learning Outcomes');
  assert.equal(normalized.schema_version, 3);
  assert.ok(Array.isArray(normalized.blocks));
  assert.ok(normalized.blocks.length >= 4);
  assert.equal(normalized.blocks[0].type, 'heading');
});

test('validation fails empty content payloads', () => {
  const result = validateStructuredLessonContent({
    title: 'Fallback Topic',
    content: {},
  });

  assert.equal(result.passed, false);
  assert.equal(result.normalized.blocks.length, 0);
});

test('converts markdown into block list safely', () => {
  const blocks = markdownToBlocks('# Heading\n\nParagraph content here\n\n- item one');
  assert.ok(blocks.length >= 3);
  assert.equal(blocks[0].type, 'heading');
});
