const { normalizeLessonDocument, validateLessonDocument } = require('./rich-content');
const { validateMediaReference } = require('./media-reference-validation');

function buildError(code, lesson, message, blockType = null) {
  return {
    code,
    lessonId: lesson?.id || null,
    lessonTitle: lesson?.title || null,
    blockType,
    message,
  };
}

function hasMeaningfulList(items = []) {
  return Array.isArray(items) && items.some((item) => String(item || '').trim().length > 0);
}

function hasMeaningfulText(text = '') {
  return String(text || '').trim().length > 0;
}

function hasMeaningfulLinkList(items = []) {
  return Array.isArray(items) && items.some((item) => hasMeaningfulText(item?.label) && hasMeaningfulText(item?.href));
}

function validateBlockIntegrity(lesson, block) {
  switch (block.type) {
    case 'objective_list':
      return hasMeaningfulList(block.payload?.objectives) || hasMeaningfulText(block.payload?.text)
        ? []
        : [buildError('OBJECTIVES_REQUIRED', lesson, 'Objective blocks must include at least one objective.', block.type)];
    case 'reference_table':
      return hasMeaningfulText(block.payload?.text) || hasMeaningfulLinkList(block.payload?.citations)
        ? []
        : [buildError('REFERENCES_REQUIRED', lesson, 'Reference blocks must include source or standards text.', block.type)];
    case 'reflection_prompts':
      return hasMeaningfulText(block.payload?.text) || (Array.isArray(block.payload?.prompts) && block.payload.prompts.some((prompt) => hasMeaningfulText(prompt)))
        ? []
        : [buildError('REFLECTION_REQUIRED', lesson, 'Reflection blocks must include at least one prompt.', block.type)];
    case 'image':
    case 'video':
    case 'file':
    case 'cta':
    case 'embed':
    case 'pdf_document': {
      const source = block.payload?.src || block.payload?.href || block.payload?.url || '';
      const validation = validateMediaReference(source);
      return validation.ok
        ? []
        : [buildError(validation.code, lesson, validation.message, block.type)];
    }
    case 'image_slot':
      if (block.payload?.resolutionStatus !== 'resolved') {
        return [buildError('IMAGE_SLOT_SOURCE_REQUIRED', lesson, 'Image slots must be resolved before publishing.', block.type)];
      }
      if (!hasMeaningfulText(block.payload?.cdnUrl)) {
        return [buildError('IMAGE_SLOT_SOURCE_REQUIRED', lesson, 'Image slots must include a resolved asset URL before publishing.', block.type)];
      }

      const validation = validateMediaReference(block.payload.cdnUrl);
      return validation.ok
        ? []
        : [buildError(validation.code, lesson, validation.message, block.type)];
    default:
      return [];
  }
}

function validatePublishableLessons(lessons = []) {
  if (!Array.isArray(lessons) || lessons.length === 0) {
    return {
      passed: false,
      errors: [
        buildError('COURSE_HAS_NO_LESSONS', null, 'At least one lesson is required before publishing.'),
      ],
      normalizedLessons: [],
    };
  }

  const errors = [];
  const normalizedLessons = lessons.map((lesson) => {
    const validation = validateLessonDocument({
      title: lesson?.title || '',
      content: lesson?.content || {},
    });

    if (!validation.passed) {
      errors.push(buildError(
        'INVALID_LESSON_CONTENT',
        lesson,
        'Lesson content failed baseline validation checks.',
      ));
    }

    for (const block of validation.normalized.blocks || []) {
      errors.push(...validateBlockIntegrity(lesson, block));
    }

    return {
      ...lesson,
      content: normalizeLessonDocument({
        title: lesson?.title || '',
        content: lesson?.content || {},
      }),
    };
  });

  return {
    passed: errors.length === 0,
    errors,
    normalizedLessons,
  };
}

module.exports = {
  validatePublishableLessons,
};
