const { normalizeLessonDocument, ALLOWED_BLOCK_TYPES } = require('./rich-content');

// Recovery Package block_type -> schema_version:3 block type.
//
// The Recovery Package documents its own block_type names as descriptive only
// ("engineering should map each to the nearest real equivalent before
// implementation"). This table is that mapping, made explicit so a reviewer can
// check it against the package without reading the converter.
const RECOVERY_BLOCK_TYPE_MAP = Object.freeze({
  objectives_card: 'objective_list',
  prose_block: 'rich_text',
  bulleted_list: 'bullet_list',
  numbered_steps: 'step_list',
  information_box: 'key_information',
  warning_box: 'warning_box',
  best_practice_box: 'best_practice',
  reflection_prompt: 'reflection_prompts',
  quick_check: 'quiz_point',
  // No table component exists in schema_version:3. reference_table is a
  // citations list (every row needs a valid href) and would fail
  // validateLessonDocument, so the package's own documented fallback applies:
  // "render as an ordered bulleted_list, one item per row, preserving all
  // three columns' text per item".
  comparison_table: 'bullet_list',
});

// RichLessonRenderer prints a fixed label for these types. A per-instance
// heading that merely restates that label would render twice, so it is dropped
// rather than emitted as a heading block. Any other heading is preserved.
const REDUNDANT_HEADINGS = Object.freeze({
  objective_list: ['learning objectives', 'objectives'],
  quiz_point: ['quick check'],
  reflection_prompts: ['reflect', 'reflection'],
  best_practice: ['best practice'],
  summary: ['summary'],
  critical_information: ['critical information'],
});

const BOX_TONES = Object.freeze({
  key_information: 'info',
  warning_box: 'warning',
  best_practice: 'success',
  important_note: 'info',
  critical_information: 'danger',
});

function text(value = '') {
  return String(value ?? '').trim();
}

function isRedundantHeading(targetType, heading) {
  const labels = REDUNDANT_HEADINGS[targetType];
  if (!labels) return false;
  return labels.includes(text(heading).toLowerCase());
}

function assert(condition, message) {
  if (!condition) throw new Error(`[recovery-converter] ${message}`);
}

/**
 * Extracts the fenced lesson JSON structures from a Recovery Package
 * "Implementation_Ready_Lesson_Structures" document.
 */
function parseRecoveryLessonStructures(markdown = '') {
  const fences = String(markdown).matchAll(/```json\s*\n([\s\S]*?)\n```/g);
  const lessons = [];

  for (const fence of fences) {
    let parsed;
    try {
      parsed = JSON.parse(fence[1]);
    } catch (error) {
      throw new Error(`[recovery-converter] unparseable JSON block: ${error.message}`);
    }
    if (!parsed || typeof parsed !== 'object') continue;
    if (!parsed.lesson_title || !Array.isArray(parsed.blocks)) continue;
    lessons.push(parsed);
  }

  return lessons;
}

function convertComparisonTableBody(body, lessonTitle) {
  assert(Array.isArray(body?.columns) && Array.isArray(body?.rows), `comparison_table in "${lessonTitle}" needs columns and rows`);
  const [firstColumn, ...restColumns] = body.columns.map(text);

  return body.rows.map((row) => {
    assert(Array.isArray(row) && row.length === body.columns.length, `comparison_table row in "${lessonTitle}" does not match its column count`);
    const [firstCell, ...restCells] = row.map(text);
    const rest = restCells.map((cell, index) => `${restColumns[index]}: ${cell}`);
    return [`${firstColumn}: ${firstCell}`, ...rest].join(' | ');
  });
}

function convertBlockPayload(sourceBlock, targetType, lessonTitle) {
  const { body } = sourceBlock;
  const where = `${sourceBlock.block_type} in "${lessonTitle}"`;

  switch (targetType) {
    case 'rich_text':
      assert(typeof body === 'string' && text(body), `${where} needs body text`);
      return { text: text(body) };

    case 'objective_list':
      assert(Array.isArray(body) && body.length, `${where} needs at least one objective`);
      return { objectives: body.map(text).filter(Boolean), text: '' };

    case 'bullet_list':
      if (sourceBlock.block_type === 'comparison_table') {
        return { items: convertComparisonTableBody(body, lessonTitle) };
      }
      assert(Array.isArray(body) && body.length, `${where} needs at least one list item`);
      return { items: body.map(text).filter(Boolean) };

    case 'step_list':
      assert(Array.isArray(body) && body.length, `${where} needs at least one step`);
      return {
        // step_list payloads are flat strings; the package's per-step title is
        // joined into the step text using the same convention as
        // bls-course-publisher, so no title is dropped.
        steps: body.map((step) => (
          typeof step === 'string' ? text(step) : [text(step?.title), text(step?.text)].filter(Boolean).join(': ')
        )).filter(Boolean),
        text: '',
      };

    case 'key_information':
    case 'warning_box':
    case 'best_practice':
      assert(typeof body === 'string' && text(body), `${where} needs body text`);
      return { text: text(body), tone: BOX_TONES[targetType] };

    case 'reflection_prompts':
      assert(typeof body === 'string' && text(body), `${where} needs prompt text`);
      // The package flags these as the text-only variant. input_capture:false is
      // asserted by the caller; reflection_prompts renders read-only prompts and
      // has no persistence field, so it is the correct target.
      return { text: '', prompts: [text(body)], links: [] };

    case 'quiz_point': {
      assert(text(body?.question) && Array.isArray(body?.options), `${where} needs a question and options`);
      const correct = body.options.findIndex((option) => option?.correct === true);
      assert(correct >= 0, `${where} has no option marked correct`);
      return {
        question: text(body.question),
        options: body.options.map((option) => text(option?.text)),
        correct,
        rationale: '',
      };
    }

    default:
      throw new Error(`[recovery-converter] no payload builder for target type "${targetType}"`);
  }
}

/**
 * Converts one Recovery Package lesson structure into a schema_version:3 lesson
 * document. Normalization is delegated to the platform's own
 * normalizeLessonDocument — this only maps types and payloads.
 */
function convertRecoveryLesson(lesson, { readingMinutes = 5, tags = [], source = 'recovery_package' } = {}) {
  const lessonTitle = text(lesson?.lesson_title);
  assert(lessonTitle, 'lesson is missing lesson_title');
  assert(Array.isArray(lesson.blocks) && lesson.blocks.length, `lesson "${lessonTitle}" has no blocks`);

  const blocks = [];
  const byType = {};
  let injectedHeadings = 0;

  for (const sourceBlock of lesson.blocks) {
    const sourceType = text(sourceBlock?.block_type);
    const targetType = RECOVERY_BLOCK_TYPE_MAP[sourceType];

    // Fail loudly rather than let normalizeBlock silently coerce an unmapped
    // type into rich_text, which would drop content the package authored.
    assert(targetType, `unmapped block_type "${sourceType}" in "${lessonTitle}"`);
    assert(ALLOWED_BLOCK_TYPES.has(targetType), `target type "${targetType}" is not accepted by rich-content`);

    // 08_Media_Requirements.md: this batch requires no new images.
    assert(!Array.isArray(sourceBlock.media) || sourceBlock.media.length === 0, `block "${sourceType}" in "${lessonTitle}" carries media, which this package does not authorise`);

    if (sourceType === 'reflection_prompt') {
      assert(sourceBlock.input_capture === false, `reflection_prompt in "${lessonTitle}" must keep input_capture:false`);
    }

    const heading = sourceBlock.heading == null ? '' : text(sourceBlock.heading);
    if (heading && !isRedundantHeading(targetType, heading)) {
      blocks.push({ type: 'heading', payload: { text: heading, level: 3 } });
      injectedHeadings += 1;
    }

    blocks.push({ type: targetType, payload: convertBlockPayload(sourceBlock, targetType, lessonTitle) });
    byType[targetType] = (byType[targetType] || 0) + 1;
  }

  const content = normalizeLessonDocument({
    title: lessonTitle,
    content: {
      schema_version: 3,
      title: lessonTitle,
      blocks,
      metadata: { locale: 'en', readingMinutes, tags },
    },
  });

  content.metadata.source = source;

  return {
    title: lessonTitle,
    content,
    report: {
      lessonTitle,
      sourceBlockCount: lesson.blocks.length,
      mappedBlockCount: blocks.length - injectedHeadings,
      injectedHeadingCount: injectedHeadings,
      renderedBlockCount: content.blocks.length,
      byType,
    },
  };
}

/**
 * Converts a whole Recovery Package structures document.
 */
function convertRecoveryPackage(markdown, options = {}) {
  const structures = parseRecoveryLessonStructures(markdown);
  assert(structures.length, 'no lesson structures found in the recovery package document');

  const lessons = structures.map((structure) => convertRecoveryLesson(structure, options));

  for (const lesson of lessons) {
    // 1:1 count check required by Preview_Build_And_Verification_Plan.md §3.
    assert(
      lesson.report.mappedBlockCount === lesson.report.sourceBlockCount,
      `block count mismatch for "${lesson.report.lessonTitle}": ${lesson.report.sourceBlockCount} source -> ${lesson.report.mappedBlockCount} mapped`,
    );
  }

  return { lessons, report: lessons.map((lesson) => lesson.report) };
}

module.exports = {
  RECOVERY_BLOCK_TYPE_MAP,
  parseRecoveryLessonStructures,
  convertRecoveryLesson,
  convertRecoveryPackage,
};
