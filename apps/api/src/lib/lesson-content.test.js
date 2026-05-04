const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLessonContent,
  validateStructuredLessonContent,
} = require('./lesson-content');

test('normalizes structured fire safety lesson content without legacy fallback data', () => {
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
  assert.equal(normalized.schema_version, 2);
  assert.equal(normalized.sections.length, 2);
  assert.equal(normalized.sections[0].heading, 'Fire safety responsibilities');
});

test('validation fails weak non-structured content instead of generating legacy lessons', () => {
  const result = validateStructuredLessonContent({
    title: 'Fallback Topic',
    content: {
      body: 'Short source text for a fallback lesson.',
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.normalized.sections.length, 0);
});
