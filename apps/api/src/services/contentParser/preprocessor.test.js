const test = require('node:test');
const assert = require('node:assert/strict');

const { preprocess } = require('./preprocessor');

test('stage1 keeps clean structured content byte-identical', () => {
  const clean = [
    '[MODULE_TITLE] Medication Safety',
    '[LESSON_TITLE] Dosing Basics',
    '[INTRO_TEXT] Always verify patient identity before administration.',
    '[WARNING_BOX] Double-check high-risk medications.',
  ].join('\n');

  const output = preprocess(clean);
  assert.equal(output, clean);
});

test('stage1 strips known contamination lines conservatively', () => {
  const dirty = [
    '[LESSON_TITLE] Safe Handling',
    'IMAGE_ID: IMG_101',
    'FILENAME: source.pdf',
    'RATIO: 16:9',
    'PROMPT: remove this line',
    'IMG_202',
    '---',
    '[INTRO_TEXT] Core lesson body remains.',
    'This explanatory line should stay.',
  ].join('\n');

  const output = preprocess(dirty);
  assert.equal(output, [
    '[LESSON_TITLE] Safe Handling',
    '[INTRO_TEXT] Core lesson body remains.',
    'This explanatory line should stay.',
  ].join('\n'));
});

test('stage2 injects conservative tags for messy copied lines', () => {
  const dirty = [
    'OBJECTIVES:',
    '1. Check patient identity',
    'WARNING: Never skip allergy checks',
    'Q: What is the first step?',
    'SUMMARY:',
    'ADMINISTRATION SAFETY OVERVIEW',
  ].join('\n');

  const output = preprocess(dirty);
  assert.equal(output, [
    '[OBJECTIVE_LIST]',
    '[STEP_LIST] 1. Check patient identity',
    '[WARNING_BOX] Never skip allergy checks',
    '[QUIZ_POINT] Question: What is the first step?',
    '[SUMMARY]',
    '[SECTION_TITLE] ADMINISTRATION SAFETY OVERVIEW',
  ].join('\n'));
});

test('stage3 inserts lesson title tag only on strong lesson heading boundaries', () => {
  const input = [
    'Lesson 2.1 Medication Storage',
    'This line remains normal text.',
    '[LESSON_TITLE] Already Tagged Lesson',
  ].join('\n');

  const output = preprocess(input);
  assert.equal(output, [
    '[LESSON_TITLE] Lesson 2.1 Medication Storage',
    'This line remains normal text.',
    '[LESSON_TITLE] Already Tagged Lesson',
  ].join('\n'));
});
