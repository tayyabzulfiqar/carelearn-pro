const MARKER_PATTERN = /^\[(IMAGE_(\d+))(?:_(LEFT|RIGHT|CENTER))?\]$/;
const VALID_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function parseMarker(line, lineNumber) {
  const match = MARKER_PATTERN.exec(line.trim());
  if (!match) {
    const err = new Error(`INVALID_MARKER_SYNTAX at line ${lineNumber}`);
    err.code = 'INVALID_MARKER_SYNTAX';
    throw err;
  }
  const key = match[1];
  const align = (match[3] || 'CENTER').toLowerCase();
  return { type: 'image_marker', key, align };
}

function isHeadingLine(line) {
  return line.startsWith('## ');
}

function pushParagraphIfNeeded(section, pendingParagraphLines) {
  if (!pendingParagraphLines.length) return;
  const text = pendingParagraphLines.join(' ').trim();
  if (text) {
    section.blocks.push({ type: 'paragraph', text });
  }
  pendingParagraphLines.length = 0;
}

function parseTrainingContract({ sourceText }) {
  const lines = String(sourceText || '').replace(/\r/g, '').split('\n');
  const cleanedLines = lines.map((line) => line.trimEnd());
  const nonEmpty = cleanedLines.filter((line) => line.trim().length > 0);
  if (!nonEmpty.length) {
    const err = new Error('EMPTY_SOURCE');
    err.code = 'EMPTY_SOURCE';
    throw err;
  }

  const title = nonEmpty[0].trim();
  const sections = [];
  let currentSection = null;
  let pendingParagraphLines = [];

  for (let index = 0; index < cleanedLines.length; index += 1) {
    const rawLine = cleanedLines[index];
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line) {
      if (currentSection) pushParagraphIfNeeded(currentSection, pendingParagraphLines);
      continue;
    }

    if (line === title && sections.length === 0 && !currentSection) {
      continue;
    }

    if (isHeadingLine(line)) {
      if (currentSection) pushParagraphIfNeeded(currentSection, pendingParagraphLines);
      const heading = line.slice(3).trim();
      if (!heading) {
        const err = new Error(`EMPTY_HEADING at line ${lineNumber}`);
        err.code = 'EMPTY_HEADING';
        throw err;
      }
      currentSection = { heading, blocks: [] };
      sections.push(currentSection);
      continue;
    }

    if (line.startsWith('[IMAGE')) {
      if (!currentSection) {
        const err = new Error(`MARKER_OUTSIDE_SECTION at line ${lineNumber}`);
        err.code = 'MARKER_OUTSIDE_SECTION';
        throw err;
      }
      pushParagraphIfNeeded(currentSection, pendingParagraphLines);
      currentSection.blocks.push(parseMarker(line, lineNumber));
      continue;
    }

    if (!currentSection) {
      const err = new Error(`CONTENT_OUTSIDE_SECTION at line ${lineNumber}`);
      err.code = 'CONTENT_OUTSIDE_SECTION';
      throw err;
    }
    pendingParagraphLines.push(line);
  }

  if (currentSection) pushParagraphIfNeeded(currentSection, pendingParagraphLines);

  if (!sections.length) {
    const err = new Error('NO_SECTIONS_FOUND');
    err.code = 'NO_SECTIONS_FOUND';
    throw err;
  }

  for (const section of sections) {
    if (!section.blocks.length) {
      const err = new Error(`EMPTY_SECTION_BLOCKS: ${section.heading}`);
      err.code = 'EMPTY_SECTION_BLOCKS';
      throw err;
    }
  }

  return { title, sections };
}

function normalizeImageFileName(name) {
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0) return null;
  const base = name.slice(0, dotIndex).trim().toUpperCase();
  const ext = name.slice(dotIndex).toLowerCase();
  if (!VALID_IMAGE_EXTENSIONS.has(ext)) return null;
  return { base, ext };
}

function collectMarkerKeys(parsed) {
  const keys = new Set();
  for (const section of parsed.sections) {
    for (const block of section.blocks) {
      if (block.type === 'image_marker') keys.add(block.key.toUpperCase());
    }
  }
  return keys;
}

function validateImageManifest(parsed, imageFiles = []) {
  const errors = [];
  const markerKeys = collectMarkerKeys(parsed);
  const manifestBases = new Set(
    imageFiles
      .map(normalizeImageFileName)
      .filter(Boolean)
      .map((entry) => entry.base)
  );

  for (const markerKey of markerKeys) {
    if (!manifestBases.has(markerKey)) {
      errors.push({
        code: 'MISSING_IMAGE_MAPPING',
        message: `No uploaded image found for marker ${markerKey}`,
        marker: markerKey,
      });
    }
  }

  return { passed: errors.length === 0, errors };
}

function buildValidationResult({ sourceText, imageFiles = [] }) {
  try {
    const canonical = parseTrainingContract({ sourceText });
    const imageValidation = validateImageManifest(canonical, imageFiles);
    if (!imageValidation.passed) {
      return {
        passed: false,
        errors: imageValidation.errors,
      };
    }
    return { passed: true, canonical, errors: [] };
  } catch (error) {
    return {
      passed: false,
      errors: [{
        code: error.code || 'CONTRACT_PARSE_ERROR',
        message: error.message,
      }],
    };
  }
}

module.exports = {
  parseTrainingContract,
  validateImageManifest,
  buildValidationResult,
};
