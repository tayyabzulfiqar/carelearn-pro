const EMPHASIS_REGEX = /\b(must|always|important|ensure)\b/gi;
const API_BASE = process.env.NEXT_PUBLIC_API_URL;
const API_ORIGIN = API_BASE ? API_BASE.replace(/\/api\/v1\/?$/, '') : '';

function resolveImageUrl(value) {
  if (value && typeof value === 'object' && typeof value.src === 'string') {
    if (!value.src) return '';
    return value.src.startsWith('http://') || value.src.startsWith('https://')
      ? value.src
      : `${API_BASE}${value.src.startsWith('/') ? value.src.replace(/^\/api\/v1/, '') : `/${value.src}`}`;
  }
  if (!value || typeof value !== 'string') return '';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('/certificates')) return `${API_ORIGIN}${value}`;
  if (value.startsWith('/api/v1')) return `${API_BASE}${value.replace(/^\/api\/v1/, '')}`;
  if (value.startsWith('/uploads')) return `${API_BASE}${value}`;
  return `${API_BASE}${value.startsWith('/') ? value : `/${value}`}`;
}

function getLessonSections(content = {}) {
  if (Array.isArray(content.sections) && content.sections.length > 0) {
    return content.sections.map((section) => ({
      heading: section.heading || 'Section',
      paragraphs: Array.isArray(section.paragraphs) ? section.paragraphs.filter(Boolean) : [],
      bullets: Array.isArray(section.bullets)
        ? section.bullets.filter(Boolean)
        : Array.isArray(section.bullet_points)
          ? section.bullet_points.filter(Boolean)
          : [],
      image: section.image || '',
    }));
  }

  return [];
}

function splitEmphasis(text = '') {
  const parts = [];
  let lastIndex = 0;
  const source = String(text);
  source.replace(EMPHASIS_REGEX, (match, _word, offset) => {
    if (offset > lastIndex) {
      parts.push({ text: source.slice(lastIndex, offset), emphasized: false });
    }
    parts.push({ text: match, emphasized: true });
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < source.length) {
    parts.push({ text: source.slice(lastIndex), emphasized: false });
  }

  return parts.length > 0 ? parts : [{ text: source, emphasized: false }];
}

module.exports = {
  EMPHASIS_REGEX,
  getLessonSections,
  resolveImageUrl,
  splitEmphasis,
};
