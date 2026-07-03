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

test('normalizes legacy numbered_steps blocks into shared step_list blocks', () => {
  const normalized = normalizeLessonContent({
    title: 'Recovery Position',
    content: {
      schema_version: 2,
      blocks: [
        {
          type: 'heading',
          text: 'Recovery Position',
        },
        {
          type: 'numbered_steps',
          steps: [
            { title: 'Step 1', text: 'Position the nearest arm.' },
            { title: 'Step 2', text: 'Roll the person onto their side.' },
          ],
        },
      ],
    },
  });

  assert.equal(normalized.blocks[0].type, 'heading');
  assert.equal(normalized.blocks[1].type, 'step_list');
  assert.deepEqual(normalized.blocks[1].payload.steps, [
    'Position the nearest arm.',
    'Roll the person onto their side.',
  ]);
});

test('preserves structured renderer block types during normalization', () => {
  const normalized = normalizeLessonContent({
    title: 'Structured Lesson',
    content: {
      schema_version: 3,
      blocks: [
        {
          type: 'image_slot',
          payload: {
            imageId: 'IMG_101',
            position: 'full_width',
            ratio: '16:9',
            cdnUrl: '/course-assets/bls/IMG_101.webp',
            resolutionStatus: 'resolved',
          },
        },
        {
          type: 'reflection_prompts',
          payload: {
            text: 'What would you do differently next time?',
          },
        },
        {
          type: 'reference_table',
          payload: {
            text: 'NICE guidance and Resuscitation Council UK',
          },
        },
      ],
    },
  });

  assert.deepEqual(
    normalized.blocks.map((block) => block.type),
    ['image_slot', 'reflection_prompts', 'reference_table']
  );
});
