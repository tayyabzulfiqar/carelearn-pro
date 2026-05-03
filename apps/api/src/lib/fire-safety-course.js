const fs = require('node:fs');
const path = require('node:path');

const ICON_KEYWORDS = [
  'sign',
  'symbol',
  'detector',
  'alarm',
  'call point',
  'extinguisher',
  'blanket',
  'door',
];

const DIAGRAM_KEYWORDS = [
  'diagram',
  'triangle',
  'plan',
  'flow',
  'route',
  'r.a.c.e',
  'race',
  'pass',
  'compartment',
  'peep',
  'spread',
];

const UNIFORM_RENDER = {
  width: 650,
  maxWidth: 650,
  height: 280,
  maxHeight: 280,
  align: 'center',
  position: 'after_bullet_block',
  objectFit: 'cover',
  marginTop: 20,
  marginBottom: 20,
};

const EXPECTED_LESSON_COUNT = 17;

function parseJsonFile(jsonPath) {
  const raw = fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\uFFFD/g, "'")
    .replace(/ï¿½/g, "'")
    .trim();
}

function normalizeFileName(value) {
  const normalized = normalizeText(value);
  return normalized ? path.basename(normalized) : '';
}

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24) {
    throw new Error(`PNG header too short: ${filePath}`);
  }

  const signature = buffer.slice(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`Unsupported image format for ${filePath}`);
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function buildImageInventory(imageDir, allowedFiles = null) {
  const allowedSet = Array.isArray(allowedFiles) ? new Set(allowedFiles.map((fileName) => normalizeFileName(fileName))) : null;
  const files = fs.existsSync(imageDir)
    ? fs.readdirSync(imageDir)
      .filter((fileName) => fileName.toLowerCase().endsWith('.png'))
      .filter((fileName) => !allowedSet || allowedSet.has(fileName))
    : [];

  return files.reduce((acc, fileName) => {
    const filePath = path.join(imageDir, fileName);
    const dimensions = readPngDimensions(filePath);
    acc[fileName] = {
      fileName,
      filePath,
      ...dimensions,
    };
    return acc;
  }, {});
}

function inferImageKind({ altText = '', heading = '', fileName = '' }) {
  const haystack = `${altText} ${heading} ${fileName}`.toLowerCase();
  if (ICON_KEYWORDS.some((keyword) => haystack.includes(keyword))) return 'icon';
  if (DIAGRAM_KEYWORDS.some((keyword) => haystack.includes(keyword))) return 'diagram';
  return 'main';
}

function normalizeParagraphs(paragraphs) {
  return Array.isArray(paragraphs)
    ? paragraphs.map((paragraph) => normalizeText(paragraph)).filter(Boolean)
    : [];
}

function normalizeBullets(section) {
  const bullets = Array.isArray(section?.bullets)
    ? section.bullets
    : Array.isArray(section?.bullet_points)
      ? section.bullet_points
      : [];
  return bullets.map((bullet) => normalizeText(bullet)).filter(Boolean);
}

function buildSectionImage(image, section, imageInventory, publicImageBase) {
  if (!image || typeof image !== 'object') return null;

  const expectedMarker = normalizeFileName(image.expected_marker);
  const assignedFile = normalizeFileName(image.assigned_file);
  const inventoryEntry = assignedFile ? imageInventory[assignedFile] : null;
  const kind = inferImageKind({
    altText: normalizeText(image.alt_text),
    heading: normalizeText(section.heading),
    fileName: assignedFile || expectedMarker,
  });

  return {
    expected_marker: expectedMarker,
    assigned_file: assignedFile,
    alt_text: normalizeText(image.alt_text),
    exists: Boolean(inventoryEntry),
    matchesExpected: Boolean(expectedMarker) && expectedMarker === assignedFile,
    src: inventoryEntry ? `${publicImageBase}/${assignedFile}` : '',
    width: inventoryEntry?.width || null,
    height: inventoryEntry?.height || null,
    kind,
    render: { ...UNIFORM_RENDER },
  };
}

function normalizeLesson(lesson, imageInventory, publicImageBase) {
  const sections = (lesson.sections || []).map((section, sectionIndex) => ({
    section_number: sectionIndex + 1,
    heading: normalizeText(section.heading),
    paragraphs: normalizeParagraphs(section.paragraphs),
    bullets: normalizeBullets(section),
    image: buildSectionImage(section.image, section, imageInventory, publicImageBase),
  }));

  return {
    lesson_number: lesson.lesson_number,
    title: normalizeText(lesson.title),
    schema_version: 2,
    sections,
  };
}

function validateLesson(normalizedLesson) {
  const sections = normalizedLesson.sections || [];
  const imageChecks = sections
    .map((section) => section.image)
    .filter(Boolean);

  const image = imageChecks.every((value) => value.exists && value.matchesExpected);
  const size = imageChecks.every((value) => {
    const { width, maxWidth, height, maxHeight } = value.render;
    return width === 650 && maxWidth === 650 && height === 280 && maxHeight === 280;
  });
  const position = imageChecks.every((value) => (
    value.render.position === 'after_bullet_block'
    && value.render.align === 'center'
    && value.render.marginTop === 20
    && value.render.marginBottom === 20
  ));
  const layout = sections.every((section) => {
    const hasSpacing = section.heading && section.paragraphs.length > 0;
    const imageFits = !section.image
      || (
        section.image.render.width === 650
        && section.image.render.maxWidth === 650
        && section.image.render.height === 280
        && section.image.render.maxHeight === 280
        && section.image.render.objectFit === 'cover'
      );
    return Boolean(hasSpacing && imageFits);
  });
  const structure = Boolean(
    normalizedLesson.title
    && sections.length >= 2
    && sections.every((section) => section.heading && section.paragraphs.length > 0)
  );

  const issues = [];

  sections.forEach((section, index) => {
    if (!section.heading) {
      issues.push(`Lesson ${normalizedLesson.lesson_number}: section ${index + 1} is missing a heading`);
    }
    if (section.paragraphs.length === 0) {
      issues.push(`Lesson ${normalizedLesson.lesson_number}: section ${index + 1} is missing paragraphs`);
    }
    if (section.image) {
      if (!section.image.exists) {
        issues.push(`Lesson ${normalizedLesson.lesson_number}: image ${section.image.assigned_file || section.image.expected_marker} is missing from source folder`);
      }
      if (!section.image.matchesExpected) {
        issues.push(`Lesson ${normalizedLesson.lesson_number}: image ${section.image.assigned_file || 'none'} does not match expected ${section.image.expected_marker}`);
      }
      if (!section.image.src.startsWith('/')) {
        issues.push(`Lesson ${normalizedLesson.lesson_number}: image ${section.image.assigned_file || section.image.expected_marker} does not resolve to a local validated source`);
      }
    }
  });

  return {
    image,
    size,
    position,
    layout,
    structure,
    issues,
  };
}

function loadFireSafetyCourseSource({ jsonPath, imageDir, publicImageBase }) {
  const parsed = parseJsonFile(jsonPath);

  if (parsed.schema_version !== 2) {
    throw new Error('fire-safety-course.json schema_version must be 2');
  }

  if (!Array.isArray(parsed.lessons) || parsed.lessons.length === 0) {
    throw new Error('fire-safety-course.json must contain lessons');
  }

  const referencedFiles = parsed.lessons.flatMap((lesson) => (
    (lesson.sections || [])
      .map((section) => normalizeFileName(section?.image?.assigned_file || section?.image?.expected_marker))
      .filter(Boolean)
  ));
  const imageInventory = buildImageInventory(imageDir, referencedFiles);

  return {
    imageInventory,
    lessons: parsed.lessons.map((lesson) => normalizeLesson(lesson, imageInventory, publicImageBase)),
  };
}

function validateFireSafetyCourseSource(source) {
  const lessons = source.lessons.map((lesson) => {
    const checks = validateLesson(lesson);
    return {
      lessonNumber: lesson.lesson_number,
      title: lesson.title,
      checks,
      content: {
        schema_version: 2,
        sections: lesson.sections,
      },
    };
  });

  const issues = [];

  if (lessons.length !== EXPECTED_LESSON_COUNT) {
    issues.push(`fire-safety-course.json must contain exactly ${EXPECTED_LESSON_COUNT} lessons; found ${lessons.length}`);
  }

  lessons.forEach((lesson) => {
    issues.push(...lesson.checks.issues);
  });

  return {
    expectedLessonCount: EXPECTED_LESSON_COUNT,
    totalLessons: lessons.length,
    lessons,
    issues,
  };
}

function formatCourseValidationReport(result) {
  const lines = [
    'COURSE VALIDATION REPORT',
    '',
    `Expected Lessons: ${result.expectedLessonCount || EXPECTED_LESSON_COUNT}`,
    `Actual Lessons: ${result.totalLessons}`,
    `Total Lessons: ${result.totalLessons}`,
    '',
  ];

  result.lessons.forEach((lesson) => {
    lines.push(`Lesson ${lesson.lessonNumber}:`);
    lines.push(`Image: ${lesson.checks.image ? 'PASS' : 'FAIL'}`);
    lines.push(`Size: ${lesson.checks.size ? 'PASS' : 'FAIL'}`);
    lines.push(`Position: ${lesson.checks.position ? 'PASS' : 'FAIL'}`);
    lines.push(`Layout: ${lesson.checks.layout ? 'PASS' : 'FAIL'}`);
    lines.push(`Structure: ${lesson.checks.structure ? 'PASS' : 'FAIL'}`);
    lines.push('');
  });

  const issues = result.issues || result.lessons.flatMap((lesson) => lesson.checks.issues);

  lines.push('FINAL STATUS:');
  lines.push('');

  if (issues.length === 0) {
    lines.push('COURSE READY FOR PRODUCTION');
  } else {
    lines.push('ISSUES FOUND:');
    issues.forEach((issue) => lines.push(`- ${issue}`));
  }

  return lines.join('\n');
}

module.exports = {
  EXPECTED_LESSON_COUNT,
  normalizeText,
  loadFireSafetyCourseSource,
  validateFireSafetyCourseSource,
  formatCourseValidationReport,
};
