const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getLessonSections,
  resolveImageUrl,
  splitEmphasis,
} = require('./lesson-sections');

test('returns structured lesson sections from content schema', () => {
  const sections = getLessonSections({
    sections: [
      {
        heading: 'Heading',
        paragraphs: ['Paragraph one'],
        bullets: ['Point one'],
        image: '/uploads/test.png',
      },
    ],
  });

  assert.equal(sections.length, 1);
  assert.equal(sections[0].heading, 'Heading');
  assert.equal(sections[0].paragraphs[0], 'Paragraph one');
  assert.equal(sections[0].bullets[0], 'Point one');
});

test('resolves upload paths against local api host', () => {
  assert.equal(
    resolveImageUrl('/api/v1/local-images/slide1_1.png'),
    'http://localhost:5000/api/v1/local-images/slide1_1.png'
  );
});

test('returns empty image url for unresolved image objects', () => {
  assert.equal(
    resolveImageUrl({ src: '' }),
    ''
  );
});

test('marks important training words for emphasis', () => {
  const parts = splitEmphasis('Staff must always ensure important checks are complete.');
  const emphasized = parts.filter((part) => part.emphasized).map((part) => part.text.toLowerCase());

  assert.deepEqual(emphasized, ['must', 'always', 'ensure', 'important']);
});
