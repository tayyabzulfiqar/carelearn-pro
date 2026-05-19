'use strict';

const VALID_POSITIONS = new Set(['full_width', 'centred_medium_width', 'full_width_banner', 'centred_small']);
const VALID_ALIGNMENTS = new Set(['center', 'left', 'right']);
const FILENAME_RE = /^(IMG_\d+)\.[a-z0-9]+$/i;
const RATIO_RE = /^\d+:\d+$/;

/**
 * parseMapping(text: string): { index, recordCount, validationErrors }
 * Parses FILE 2 (Image Mapping File) into a keyed index.
 */
function parseMapping(text) {
  const validationErrors = [];
  const index = {};
  const seenIds = new Set();

  // Split into records by separator line (---) or double-blank or next IMAGE_ID:
  const rawRecords = splitIntoRecords(text);

  for (const record of rawRecords) {
    if (!record.trim()) continue;

    const fields = parseFields(record);
    const imageId = normaliseImageId(fields['image_id'] || fields['imageid'] || '');

    if (!imageId) continue;

    if (seenIds.has(imageId)) {
      validationErrors.push(`Duplicate IMAGE_ID: ${imageId}`);
      continue;
    }
    seenIds.add(imageId);

    const position = (fields['position'] || '').toLowerCase().trim();
    const alignment = (fields['alignment'] || 'center').toLowerCase().trim();
    const filename = (fields['filename'] || '').trim();
    const ratio = (fields['ratio'] || '16:9').trim();

    // Validation
    if (position && !VALID_POSITIONS.has(position)) {
      validationErrors.push(`${imageId}: invalid POSITION "${position}"`);
    }
    if (alignment && !VALID_ALIGNMENTS.has(alignment)) {
      validationErrors.push(`${imageId}: invalid ALIGNMENT "${alignment}"`);
    }
    if (filename && !FILENAME_RE.test(filename)) {
      validationErrors.push(`${imageId}: FILENAME "${filename}" does not match [IMAGE_ID].[ext] pattern`);
    }
    if (ratio && !RATIO_RE.test(ratio)) {
      validationErrors.push(`${imageId}: RATIO "${ratio}" is not [integer]:[integer] format`);
    }

    // Collect extra fields not in the known set
    const knownKeys = new Set(['image_id','imageid','lesson','chapter','placement','position','ratio','size','size_spec','alignment','frame_style','filename','notes']);
    const extra = {};
    for (const [k, v] of Object.entries(fields)) {
      if (!knownKeys.has(k)) extra[k] = v;
    }

    index[imageId] = {
      imageId,
      lessonContext: fields['lesson'] || '',
      chapterContext: fields['chapter'] || '',
      placement: fields['placement'] || '',
      position: VALID_POSITIONS.has(position) ? position : 'full_width',
      ratio: RATIO_RE.test(ratio) ? ratio : '16:9',
      sizeSpec: fields['size'] || fields['size_spec'] || '',
      alignment: VALID_ALIGNMENTS.has(alignment) ? alignment : 'center',
      frameStyle: (fields['frame_style'] || 'none').trim(),
      filename,
      notes: fields['notes'] || '',
      extra,
    };
  }

  return {
    index,
    recordCount: Object.keys(index).length,
    validationErrors,
  };
}

function splitIntoRecords(text) {
  // Split on --- separator lines
  const parts = text.split(/^---+\s*$/m);
  // Also handle records that start with IMAGE_ID: without --- separator
  const result = [];
  for (const part of parts) {
    const sub = part.split(/(?=^IMAGE_ID:)/im);
    for (const s of sub) {
      if (s.trim()) result.push(s);
    }
  }
  return result;
}

function parseFields(record) {
  const fields = {};
  const lines = record.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([^:]+):\s*(.*)/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase().replace(/[\s-]/g, '_');
    const val = m[2].trim();
    fields[key] = val;
  }
  return fields;
}

function normaliseImageId(raw) {
  if (!raw) return null;
  const m = raw.trim().match(/IMG_(\d+)/i);
  if (m) return `IMG_${m[1]}`;
  return null;
}

module.exports = { parseMapping };
