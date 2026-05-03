const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeLessonContent,
  validateStructuredLessonContent,
} = require('./lesson-content');

test('normalizes legacy fire safety lesson content into structured sections', () => {
  const content = {
    body: 'Fire is a chemical reaction that produces heat, smoke, and toxic gases. It requires three elements: heat, fuel, and oxygen.',
    image_url: '/uploads/example.png',
    images: ['/uploads/example.png'],
    micro_check: {
      question: 'What are the three elements of fire?',
      options: ['Heat, Fuel, Oxygen', 'Water, Smoke, Heat'],
      answer: 0,
    },
  };

  const normalized = normalizeLessonContent({ title: 'What Is Fire', content });

  assert.equal(normalized.title, 'What Is Fire');
  assert.equal(normalized.schema_version, 2);
  assert.equal(normalized.sections.length, 2);
  assert.equal(normalized.sections[0].heading, 'Understanding Combustion');
  assert.equal(normalized.micro_check.question, 'What are the three elements of fire?');
  assert.equal(normalized.sections[1].image, '/uploads/example.png');
});

test('validation auto-fixes weak legacy content into a passing structured lesson', () => {
  const result = validateStructuredLessonContent({
    title: 'Fallback Topic',
    content: {
      body: 'Short source text for a fallback lesson.',
      images: ['/uploads/fallback.png'],
    },
  });

  assert.equal(result.passed, true);
  assert.equal(result.checks.hasTitle, true);
  assert.equal(result.checks.hasTwoSections, true);
  assert.equal(result.checks.allSectionsHaveHeading, true);
  assert.equal(result.checks.allSectionsHaveContent, true);
  assert.equal(result.checks.contentReadable, true);
  assert.equal(result.normalized.sections.length, 2);
});
