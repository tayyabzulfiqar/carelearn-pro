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

