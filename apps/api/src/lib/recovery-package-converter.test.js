const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RECOVERY_BLOCK_TYPE_MAP,
  parseRecoveryLessonStructures,
  convertRecoveryLesson,
  convertRecoveryPackage,
} = require('./recovery-package-converter');
const { ALLOWED_BLOCK_TYPES } = require('./rich-content');
const { validatePublishableLessons } = require('./course-content-integrity');

function lesson(blocks, title = 'Test Lesson') {
  return { lesson_title: title, blocks };
}

const PROSE = { block_type: 'prose_block', heading: 'Why This Matters', body: 'A body long enough to satisfy the readable-text baseline check.', media: [], input_capture: false };

test('every mapped target type is accepted by rich-content', () => {
  for (const target of Object.values(RECOVERY_BLOCK_TYPE_MAP)) {
    assert.ok(ALLOWED_BLOCK_TYPES.has(target), `${target} must be an allowed block type`);
  }
});

test('parses fenced lesson structures and ignores non-lesson JSON', () => {
  const markdown = [
    '```json',
    JSON.stringify({ lesson_title: 'A', blocks: [PROSE] }),
    '```',
    '```json',
    JSON.stringify({ not_a_lesson: true }),
    '```',
  ].join('\n');

  const parsed = parseRecoveryLessonStructures(markdown);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].lesson_title, 'A');
});

test('maps each package block type to its schema v3 equivalent', () => {
  const { content } = convertRecoveryLesson(lesson([
    { block_type: 'objectives_card', heading: 'Learning Objectives', body: ['Do a thing.'], media: [], input_capture: false },
    PROSE,
    { block_type: 'information_box', heading: 'Note', body: 'Info body.', media: [], input_capture: false },
    { block_type: 'warning_box', heading: 'Careful', body: 'Warning body.', media: [], input_capture: false },
    { block_type: 'best_practice_box', heading: 'Do this', body: 'Best practice body.', media: [], input_capture: false },
    { block_type: 'bulleted_list', heading: 'Habits', body: ['One.', 'Two.'], media: [], input_capture: false },
  ]));

  const types = content.blocks.map((block) => block.type);
  assert.deepEqual(types, [
    'objective_list',
    'heading', 'rich_text',
    'heading', 'key_information',
    'heading', 'warning_box',
    'heading', 'best_practice',
    'heading', 'bullet_list',
  ]);
  assert.equal(content.schema_version, 3);
});

test('preserves per-instance headings but drops ones the renderer already prints', () => {
  const { content } = convertRecoveryLesson(lesson([
    { block_type: 'objectives_card', heading: 'Learning Objectives', body: ['Objective.'], media: [], input_capture: false },
    PROSE,
    { block_type: 'reflection_prompt', heading: 'Reflect', body: 'A reflective question?', media: [], input_capture: false },
  ]));

  const headings = content.blocks.filter((block) => block.type === 'heading').map((block) => block.payload.text);
  assert.deepEqual(headings, ['Why This Matters'], 'built-in labels must not be duplicated as heading blocks');
});

test('a null heading emits no heading block', () => {
  const { content } = convertRecoveryLesson(lesson([
    { block_type: 'prose_block', heading: null, body: 'Body text that is comfortably long enough.', media: [], input_capture: false },
  ]));
  assert.equal(content.blocks.filter((block) => block.type === 'heading').length, 0);
});

test('numbered_steps keeps each step title alongside its text', () => {
  const { content } = convertRecoveryLesson(lesson([
    PROSE,
    {
      block_type: 'numbered_steps',
      heading: 'How to',
      body: [
        { step: 1, title: 'Open the airway', text: 'Tilt the head back gently.' },
        { step: 2, title: 'Pinch the nose', text: 'Pinch the soft part closed.' },
      ],
      media: [],
      input_capture: false,
    },
  ]));

  const steps = content.blocks.find((block) => block.type === 'step_list').payload.steps;
  assert.deepEqual(steps, [
    'Open the airway: Tilt the head back gently.',
    'Pinch the nose: Pinch the soft part closed.',
  ]);
});

test('quick_check becomes a quiz_point with the correct option index', () => {
  const { content } = convertRecoveryLesson(lesson([
    PROSE,
    {
      block_type: 'quick_check',
      heading: 'Quick Check',
      body: {
        question: 'What tells you the breath worked?',
        options: [
          { text: 'Resistance', correct: false },
          { text: 'The chest visibly rises', correct: true },
          { text: 'A cough', correct: false },
        ],
      },
      media: [],
      input_capture: false,
    },
  ]));

  const quiz = content.blocks.find((block) => block.type === 'quiz_point');
  assert.equal(quiz.payload.correct, 1);
  assert.deepEqual(quiz.payload.options, ['Resistance', 'The chest visibly rises', 'A cough']);
});

test('comparison_table falls back to a bullet_list preserving every column', () => {
  const { content } = convertRecoveryLesson(lesson([
    PROSE,
    {
      block_type: 'comparison_table',
      heading: 'At a Glance',
      body: {
        columns: ['Plan', 'What it covers', 'Legal status'],
        rows: [['ADRT', 'A refused treatment', 'Legally binding, when valid']],
      },
      media: [],
      input_capture: false,
    },
  ]));

  const items = content.blocks.find((block) => block.type === 'bullet_list').payload.items;
  assert.deepEqual(items, ['Plan: ADRT | What it covers: A refused treatment | Legal status: Legally binding, when valid']);
});

test('reflection_prompt maps to a read-only reflection_prompts block', () => {
  const { content } = convertRecoveryLesson(lesson([
    PROSE,
    { block_type: 'reflection_prompt', heading: 'Reflect', body: 'How do you feel about this?', media: [], input_capture: false },
  ]));

  const reflection = content.blocks.find((block) => block.type === 'reflection_prompts');
  assert.deepEqual(reflection.payload.prompts, ['How do you feel about this?']);
  assert.deepEqual(reflection.payload.links, []);
});

test('rejects a reflection_prompt that asks for input capture', () => {
  assert.throws(() => convertRecoveryLesson(lesson([
    PROSE,
    { block_type: 'reflection_prompt', heading: 'Reflect', body: 'Prompt?', media: [], input_capture: true },
  ])), /input_capture:false/);
});

test('rejects an unmapped block type instead of coercing it to rich_text', () => {
  assert.throws(() => convertRecoveryLesson(lesson([
    PROSE,
    { block_type: 'hologram_box', heading: 'New', body: 'Body.', media: [], input_capture: false },
  ])), /unmapped block_type "hologram_box"/);
});

test('rejects a block carrying unauthorised media', () => {
  assert.throws(() => convertRecoveryLesson(lesson([
    { ...PROSE, media: [{ url: '/x.png', alt_text: 'x' }] },
  ])), /carries media/);
});

test('rejects a quick_check with no correct option', () => {
  assert.throws(() => convertRecoveryLesson(lesson([
    PROSE,
    {
      block_type: 'quick_check',
      heading: 'Quick Check',
      body: { question: 'Q?', options: [{ text: 'A', correct: false }] },
      media: [],
      input_capture: false,
    },
  ])), /no option marked correct/);
});

test('convertRecoveryPackage enforces a 1:1 source-to-mapped block count', () => {
  const markdown = ['```json', JSON.stringify(lesson([
    PROSE,
    { block_type: 'information_box', heading: 'Note', body: 'Info body.', media: [], input_capture: false },
  ], 'Counted Lesson')), '```'].join('\n');

  const { report } = convertRecoveryPackage(markdown);
  assert.equal(report[0].sourceBlockCount, 2);
  assert.equal(report[0].mappedBlockCount, 2);
  assert.equal(report[0].injectedHeadingCount, 2);
  assert.equal(report[0].renderedBlockCount, 4);
});

test('converted lessons pass the platform publish validator', () => {
  const { lessons } = convertRecoveryPackage(['```json', JSON.stringify(lesson([
    { block_type: 'objectives_card', heading: 'Learning Objectives', body: ['Objective one.'], media: [], input_capture: false },
    PROSE,
    { block_type: 'reflection_prompt', heading: 'Reflect', body: 'A prompt?', media: [], input_capture: false },
  ], 'Validated Lesson')), '```'].join('\n'));

  const result = validatePublishableLessons(lessons.map((entry) => ({ title: entry.title, content: entry.content })));
  assert.deepEqual(result.errors, []);
  assert.equal(result.passed, true);
});
