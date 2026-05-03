const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeText,
  loadFireSafetyCourseSource,
  validateFireSafetyCourseSource,
  formatCourseValidationReport,
} = require('./fire-safety-course');

function makePseudoPng(width, height) {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 4, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carelearn-fire-safety-'));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('loads schema_version 2 source and detects image mismatch failures', () => withTempDir((dir) => {
  fs.writeFileSync(path.join(dir, 'slide1_1.png'), makePseudoPng(900, 400));

  const jsonPath = path.join(dir, 'fire-safety-course.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    schema_version: 2,
    lessons: [
      {
        lesson_number: 1,
        title: 'Learning Outcomes',
        sections: [
          {
            heading: 'Section One',
            paragraphs: ['Paragraph one'],
            bullet_points: ['Bullet one'],
            image: {
              expected_marker: 'slide1_1.png',
              assigned_file: 'slide1_2.png',
              alt_text: 'Main fire safety image',
            },
          },
          {
            heading: 'Section Two',
            paragraphs: ['Paragraph two'],
            bullet_points: ['Bullet two'],
          },
        ],
      },
    ],
  }), 'utf8');

  const source = loadFireSafetyCourseSource({
    jsonPath,
    imageDir: dir,
    publicImageBase: '/uploads/course-test/images',
  });
  const result = validateFireSafetyCourseSource(source);

  assert.equal(result.totalLessons, 1);
  assert.equal(result.lessons[0].checks.image, false);
  assert.equal(result.lessons[0].checks.structure, true);
  assert.match(formatCourseValidationReport(result), /Image: FAIL/);
  assert.match(formatCourseValidationReport(result), /ISSUES FOUND:/);
}));

test('builds render metadata and passes validation for matching diagram images', () => withTempDir((dir) => {
  fs.writeFileSync(path.join(dir, 'slide2_1.png'), makePseudoPng(1200, 700));

  const jsonPath = path.join(dir, 'fire-safety-course.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    schema_version: 2,
    lessons: [
      {
        lesson_number: 2,
        title: 'Fire & Smoke',
        sections: [
          {
            heading: 'Fire Triangle',
            paragraphs: ['Paragraph one'],
            bullet_points: ['Bullet one'],
            image: {
              expected_marker: 'slide2_1.png',
              assigned_file: 'slide2_1.png',
              alt_text: 'Fire triangle diagram showing heat, fuel and oxygen.',
            },
          },
          {
            heading: 'Smoke',
            paragraphs: ['Paragraph two'],
            bullet_points: ['Bullet two'],
          },
        ],
      },
    ],
  }), 'utf8');

  const source = loadFireSafetyCourseSource({
    jsonPath,
    imageDir: dir,
    publicImageBase: '/uploads/course-test/images',
  });
  const result = validateFireSafetyCourseSource(source);
  const sectionImage = result.lessons[0].content.sections[0].image;

  assert.equal(result.lessons[0].checks.image, true);
  assert.equal(result.lessons[0].checks.size, true);
  assert.equal(sectionImage.kind, 'diagram');
  assert.equal(sectionImage.render.width, 650);
  assert.equal(sectionImage.render.maxWidth, 650);
  assert.equal(sectionImage.render.height, 280);
  assert.equal(sectionImage.render.maxHeight, 280);
  assert.equal(sectionImage.render.align, 'center');
  assert.equal(sectionImage.render.objectFit, 'cover');
  assert.equal(sectionImage.render.position, 'after_bullet_block');
  assert.equal(sectionImage.src, '/uploads/course-test/images/slide2_1.png');
}));

test('rejects non-schema-version-2 sources', () => withTempDir((dir) => {
  const jsonPath = path.join(dir, 'fire-safety-course.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ schema_version: 1, lessons: [] }), 'utf8');

  assert.throws(() => loadFireSafetyCourseSource({
    jsonPath,
    imageDir: dir,
    publicImageBase: '/uploads/course-test/images',
  }), /schema_version must be 2/i);
}));

test('flags sources that do not contain exactly 17 lessons', () => withTempDir((dir) => {
  fs.writeFileSync(path.join(dir, 'slide1_1.png'), makePseudoPng(1200, 700));

  const jsonPath = path.join(dir, 'fire-safety-course.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    schema_version: 2,
    lessons: [
      {
        lesson_number: 1,
        title: 'Learning Outcomes',
        sections: [
          {
            heading: 'Section One',
            paragraphs: ['Paragraph one'],
            bullet_points: ['Bullet one'],
            image: {
              expected_marker: 'slide1_1.png',
              assigned_file: 'slide1_1.png',
            },
          },
          {
            heading: 'Section Two',
            paragraphs: ['Paragraph two'],
            bullet_points: ['Bullet two'],
          },
        ],
      },
    ],
  }), 'utf8');

  const source = loadFireSafetyCourseSource({
    jsonPath,
    imageDir: dir,
    publicImageBase: '/api/v1/local-images',
  });
  const result = validateFireSafetyCourseSource(source);
  const report = formatCourseValidationReport(result);

  assert.equal(result.totalLessons, 1);
  assert.equal(result.expectedLessonCount, 17);
  assert.match(report, /Expected Lessons: 17/);
  assert.match(report, /Actual Lessons: 1/);
  assert.match(report, /must contain exactly 17 lessons/i);
}));

test('normalizes replacement characters to apostrophes', () => {
  assert.equal(normalizeText('CQCï¿½s providerï¿½s homeï¿½s policy'), "CQC's provider's home's policy");
});
