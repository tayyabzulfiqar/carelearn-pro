'use strict';

const VALID_POSITIONS = new Set(['full_width', 'centred_medium_width', 'full_width_banner', 'centred_small']);
const VALID_ALIGNMENTS = new Set(['center', 'left', 'right']);
const FILENAME_RE = /^IMG_\d+\.[a-z0-9]+$/i;
const RATIO_RE = /^\d+:\d+$/;

/**
 * validate(courseDom, mappingIndex): ValidationResult
 * Checks cross-file integrity before any DB writes.
 */
function validate(courseDom, mappingIndex) {
  const blockingErrors = [];
  const warnings = [];

  // Collect all image IDs from FILE 1
  const file1ImageIds = new Set();
  const seenImageIdsInFile1 = {};

  for (const mod of courseDom.modules) {
    // Rule 9: MODULE_TITLE must have text
    if (!mod.title || !mod.title.trim() || mod._implicit) {
      if (mod._implicit) {
        warnings.push({ rule: 10, imageId: null, detail: `Implicit module created — no [MODULE_TITLE] before first [LESSON_TITLE]` });
      } else {
        blockingErrors.push({ rule: 10, imageId: null, detail: `Module ${mod.moduleNumber} has no title text` });
      }
    }

    for (const lesson of mod.lessons) {
      // Rule 9: LESSON_TITLE must have text
      if (!lesson.title || !lesson.title.trim() || lesson._implicit) {
        if (lesson._implicit) {
          warnings.push({ rule: 9, imageId: null, detail: `Implicit lesson created — content before first [LESSON_TITLE]` });
        } else {
          blockingErrors.push({ rule: 9, imageId: null, detail: `Module ${mod.moduleNumber}, Lesson ${lesson.lessonNumber} has no title text` });
        }
      }

      for (const block of lesson.blocks) {
        if (block.blockType === 'IMAGE_SLOT') {
          const id = block.imageId;
          if (!id) {
            blockingErrors.push({ rule: 1, imageId: null, detail: 'IMAGE_SLOT block missing image ID' });
            continue;
          }
          file1ImageIds.add(id);
          // Rule 5: no duplicate IMAGE_IDs in FILE 1
          if (seenImageIdsInFile1[id]) {
            blockingErrors.push({ rule: 5, imageId: id, detail: `IMAGE_ID ${id} appears more than once in FILE 1` });
          } else {
            seenImageIdsInFile1[id] = true;
          }
          // Rule 1: every IMAGE_ID in FILE 1 must exist in mappingIndex
          if (!mappingIndex[id]) {
            blockingErrors.push({ rule: 1, imageId: id, detail: `IMAGE_ID ${id} in FILE 1 has no mapping record in FILE 2` });
          }
        }

        // Rule 11: QUIZ_POINT must have required fields
        if (block.blockType === 'QUIZ_POINT') {
          const d = block.data;
          if (!d.question) {
            blockingErrors.push({ rule: 11, imageId: null, detail: `QUIZ_POINT at block ${block.blockIndex} in "${lesson.title}" missing question text` });
          }
          if (!d.options || d.options.length < 2) {
            blockingErrors.push({ rule: 11, imageId: null, detail: `QUIZ_POINT at block ${block.blockIndex} in "${lesson.title}" needs at least 2 options` });
          }
          if (d.correct === null || d.correct === undefined) {
            blockingErrors.push({ rule: 11, imageId: null, detail: `QUIZ_POINT at block ${block.blockIndex} in "${lesson.title}" missing correct answer` });
          }
          if (!d.rationale) {
            warnings.push({ rule: 11, imageId: null, detail: `QUIZ_POINT at block ${block.blockIndex} in "${lesson.title}" missing rationale` });
          }
        }
      }
    }
  }

  // Rules against mappingIndex
  for (const [imageId, mapping] of Object.entries(mappingIndex)) {
    // Rule 2: every IMAGE_ID in FILE 2 must have FILENAME
    if (!mapping.filename) {
      blockingErrors.push({ rule: 2, imageId, detail: `IMAGE_ID ${imageId} in FILE 2 has no FILENAME field` });
    }
    // Rule 3: FILENAME follows [IMAGE_ID].[extension]
    if (mapping.filename && !FILENAME_RE.test(mapping.filename)) {
      blockingErrors.push({ rule: 3, imageId, detail: `FILENAME "${mapping.filename}" for ${imageId} does not match [IMAGE_ID].[ext]` });
    }
    // Rule 6: POSITION must be valid
    if (mapping.position && !VALID_POSITIONS.has(mapping.position)) {
      blockingErrors.push({ rule: 6, imageId, detail: `POSITION "${mapping.position}" for ${imageId} is not a valid position token` });
    }
    // Rule 7: ALIGNMENT must be valid
    if (mapping.alignment && !VALID_ALIGNMENTS.has(mapping.alignment)) {
      blockingErrors.push({ rule: 7, imageId, detail: `ALIGNMENT "${mapping.alignment}" for ${imageId} is not valid` });
    }
    // Rule 8: RATIO format
    if (mapping.ratio && !RATIO_RE.test(mapping.ratio)) {
      blockingErrors.push({ rule: 8, imageId, detail: `RATIO "${mapping.ratio}" for ${imageId} is not [integer]:[integer] format` });
    }
  }

  const isValid = blockingErrors.length === 0;
  const summary = isValid
    ? `Validation passed. ${warnings.length} warning(s).`
    : `Validation FAILED: ${blockingErrors.length} blocking error(s), ${warnings.length} warning(s).`;

  return { isValid, blockingErrors, warnings, summary };
}

module.exports = { validate };
