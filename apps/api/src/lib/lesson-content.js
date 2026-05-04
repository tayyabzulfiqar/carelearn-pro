function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSection(section = {}, index = 0) {
  return {
    section_number: section.section_number || index + 1,
    heading: normalizeText(section.heading || `Section ${index + 1}`),
    paragraphs: Array.isArray(section.paragraphs)
      ? section.paragraphs.map(normalizeText).filter(Boolean)
      : [],
    bullets: Array.isArray(section.bullets)
      ? section.bullets.map(normalizeText).filter(Boolean)
      : Array.isArray(section.bullet_points)
        ? section.bullet_points.map(normalizeText).filter(Boolean)
        : [],
    image: section.image || '',
  };
}

function normalizeLessonContent({ title, content = {} }) {
  const parsed = typeof content === 'string' ? JSON.parse(content || '{}') : content;
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections.map(normalizeSection)
    : [];

  return {
    ...parsed,
    title: normalizeText(parsed.title || title),
    schema_version: 2,
    sections,
  };
}

function validateStructuredLessonContent({ title, content = {} }) {
  const normalized = normalizeLessonContent({ title, content });
  const checks = {
    hasTitle: Boolean(normalized.title),
    hasTwoSections: normalized.sections.length >= 2,
    allSectionsHaveHeading: normalized.sections.every((section) => Boolean(section.heading)),
    allSectionsHaveContent: normalized.sections.every((section) => (
      section.paragraphs.length > 0 || section.bullets.length > 0
    )),
    contentReadable: normalized.sections.every((section) => (
      section.paragraphs.concat(section.bullets).join(' ').length >= 40
    )),
  };

  return {
    normalized,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

module.exports = {
  normalizeLessonContent,
  validateStructuredLessonContent,
};
