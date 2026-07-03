const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validatePublishableLessons,
} = require('./course-content-integrity');

test('fails publish validation when a course has no lessons', () => {
  const result = validatePublishableLessons([]);

  assert.equal(result.passed, false);
  assert.deepEqual(result.errors, [
    {
      code: 'COURSE_HAS_NO_LESSONS',
      lessonId: null,
      lessonTitle: null,
      blockType: null,
      message: 'At least one lesson is required before publishing.',
    },
  ]);
});

test('fails publish validation for empty structured objectives, references, and reflection blocks', () => {
  const result = validatePublishableLessons([
    {
      id: 'lesson-1',
      title: 'Structured Lesson',
      content: {
        schema_version: 3,
        title: 'Structured Lesson',
        blocks: [
          { type: 'heading', payload: { text: 'Structured Lesson', level: 2 } },
          { type: 'objective_list', payload: { objectives: [] } },
          { type: 'reference_table', payload: { text: '   ' } },
          { type: 'reflection_prompts', payload: { text: '' } },
        ],
      },
    },
  ]);

  assert.equal(result.passed, false);
  assert.deepEqual(result.errors.map((error) => error.code), [
    'OBJECTIVES_REQUIRED',
    'REFERENCES_REQUIRED',
    'REFLECTION_REQUIRED',
  ]);
});

test('fails publish validation for media blocks without usable sources', () => {
  const result = validatePublishableLessons([
    {
      id: 'lesson-2',
      title: 'Media Lesson',
      content: {
        schema_version: 3,
        title: 'Media Lesson',
        blocks: [
          { type: 'heading', payload: { text: 'Media Lesson', level: 2 } },
          { type: 'rich_text', payload: { text: 'This lesson has enough readable narrative text to pass baseline validation.' } },
          { type: 'image', payload: { src: '', alt: 'Missing image source' } },
          { type: 'image_slot', payload: { resolutionStatus: 'resolved', cdnUrl: '' } },
          { type: 'pdf_document', payload: { url: '' } },
        ],
      },
    },
  ]);

  assert.equal(result.passed, false);
  assert.deepEqual(result.errors.map((error) => error.code), [
    'MEDIA_SOURCE_REQUIRED',
    'IMAGE_SLOT_SOURCE_REQUIRED',
    'MEDIA_SOURCE_REQUIRED',
  ]);
});

test('passes publish validation for valid legacy and structured lesson content', () => {
  const result = validatePublishableLessons([
    {
      id: 'lesson-legacy',
      title: 'Legacy Lesson',
      content: {
        schema_version: 2,
        title: 'Legacy Lesson',
        blocks: [
          { type: 'heading', text: 'Legacy Lesson', level: 2 },
          {
            type: 'numbered_steps',
            steps: [
              { title: 'Step 1', text: 'Check the scene before helping the resident.' },
              { title: 'Step 2', text: 'Call for support and begin the emergency response.' },
            ],
          },
          {
            type: 'paragraph',
            text: 'This lesson contains enough readable content to support a valid publish decision.',
          },
        ],
      },
    },
    {
      id: 'lesson-structured',
      title: 'Structured Lesson',
      content: {
        schema_version: 3,
        title: 'Structured Lesson',
        blocks: [
          { type: 'heading', payload: { text: 'Structured Lesson', level: 2 } },
          {
            type: 'objective_list',
            payload: { objectives: ['Identify the hazard', 'Escalate to the senior carer'] },
          },
          {
            type: 'reference_table',
            payload: { text: 'CQC Safe\\nLocal fire plan rev. 3' },
          },
          {
            type: 'reflection_prompts',
            payload: { text: 'What would you remove first from the room?' },
          },
          {
            type: 'image_slot',
            payload: {
              resolutionStatus: 'resolved',
              cdnUrl: '/uploads/media/valid-image.webp',
            },
          },
          {
            type: 'rich_text',
            payload: { text: 'This structured lesson also includes sufficient narrative text for learners.' },
          },
        ],
      },
    },
  ]);

  assert.equal(result.passed, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalizedLessons.length, 2);
});
