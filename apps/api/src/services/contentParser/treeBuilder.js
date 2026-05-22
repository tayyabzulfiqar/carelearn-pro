'use strict';

const IMAGE_ID_RE = /(?:ID=)?(IMG_\d+)/i;

function extractImageId(content) {
  if (!content) return null;
  const m = content.match(IMAGE_ID_RE);
  return m ? m[1].toUpperCase() : null;
}

/**
 * buildTree(tokens: Token[]): CourseDom
 * Converts flat token array into a hierarchical Course DOM.
 */
function buildTree(tokens) {
  const modules = [];
  let currentModule = null;
  let currentLesson = null;
  let moduleCounter = 0;
  let lessonCounter = 0;
  let globalBlockIndex = 0;
  const allImageIds = [];

  const ensureModule = () => {
    if (!currentModule) {
      moduleCounter++;
      currentModule = {
        type: 'MODULE',
        moduleNumber: moduleCounter,
        title: `Module ${moduleCounter}`,
        lessons: [],
        _implicit: true,
      };
      modules.push(currentModule);
    }
  };

  const ensureLesson = () => {
    ensureModule();
    if (!currentLesson) {
      lessonCounter++;
      currentLesson = {
        type: 'LESSON',
        moduleNumber: currentModule.moduleNumber,
        lessonNumber: lessonCounter,
        title: `Lesson ${lessonCounter}`,
        blocks: [],
        _implicit: true,
      };
      currentModule.lessons.push(currentLesson);
    }
  };

  // Process BLOCK_CONTENT tokens: accumulate into previous block's text
  // First pass: merge BLOCK_CONTENT into preceding BLOCK_OPEN tokens
  const merged = [];
  for (const token of tokens) {
    if (token.type === 'BLOCK_CONTENT') {
      const prev = merged[merged.length - 1];
      const prevIsBoundary = prev && prev.type === 'BLOCK_OPEN'
        && (prev.blockType === 'LESSON_TITLE' || prev.blockType === 'MODULE_TITLE');
      if (prev && prev.type === 'BLOCK_OPEN' && !prevIsBoundary) {
        prev.content = prev.content ? `${prev.content}\n${token.content}` : token.content;
      } else {
        // Orphan content (no preceding block, or follows a boundary tag) → INTRO_TEXT
        merged.push({
          type: 'BLOCK_OPEN',
          blockType: 'INTRO_TEXT',
          content: token.content,
          lineNumber: token.lineNumber,
        });
      }
    } else {
      merged.push(token);
    }
  }

  for (const token of merged) {
    if (token.type !== 'BLOCK_OPEN') continue;

    switch (token.blockType) {
      case 'MODULE_TITLE': {
        moduleCounter++;
        currentModule = {
          type: 'MODULE',
          moduleNumber: moduleCounter,
          title: token.content || `Module ${moduleCounter}`,
          lessons: [],
        };
        modules.push(currentModule);
        currentLesson = null;
        break;
      }

      case 'LESSON_TITLE': {
        ensureModule();
        lessonCounter++;
        currentLesson = {
          type: 'LESSON',
          moduleNumber: currentModule.moduleNumber,
          lessonNumber: lessonCounter,
          title: token.content || `Lesson ${lessonCounter}`,
          blocks: [],
        };
        currentModule.lessons.push(currentLesson);
        globalBlockIndex = 0; // reset per lesson
        break;
      }

      case 'COURSE_META':
      case 'COURSE_INDEX':
        // Course-level metadata — store on first module if present, else skip
        // (not rendered as lesson blocks)
        break;

      default: {
        ensureLesson();
        const imageId = token.blockType === 'IMAGE_SLOT'
          ? (token.imageId || extractImageId(token.content))
          : null;
        const block = {
          type: 'CONTENT_BLOCK',
          blockType: token.blockType,
          blockIndex: globalBlockIndex++,
          data: buildBlockData(token),
          imageId,
          resolutionStatus: token.blockType === 'IMAGE_SLOT' ? 'unresolved' : 'na',
        };
        currentLesson.blocks.push(block);
        if (imageId) allImageIds.push(imageId);
        break;
      }
    }
  }

  // Count stats
  let blockCount = 0;
  let imageSlotCount = 0;
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      blockCount += lesson.blocks.length;
      imageSlotCount += lesson.blocks.filter(b => b.blockType === 'IMAGE_SLOT').length;
    }
  }

  return {
    type: 'COURSE',
    modules,
    stats: {
      moduleCount: modules.length,
      lessonCount: modules.reduce((sum, m) => sum + m.lessons.length, 0),
      blockCount,
      imageSlotCount,
      imageIds: [...new Set(allImageIds)],
    },
  };
}

function buildBlockData(token) {
  const base = { text: token.content || '' };

  switch (token.blockType) {
    case 'QUIZ_POINT':
      return {
        question: token.quizData?.question || '',
        options: token.quizData?.optionsArray || [],
        correct: token.quizData?.correct ?? 0,
        rationale: token.quizData?.rationale || '',
      };
    case 'STEP_LIST': {
      // Parse step lines: "Step N: text" or just text lines
      const lines = (token.content || '').split('\n').map(l => l.trim()).filter(Boolean);
      const steps = lines.map(l => l.replace(/^Step\s*\d+:\s*/i, '').trim());
      return { steps, text: token.content || '' };
    }
    case 'OBJECTIVE_LIST': {
      const lines = (token.content || '').split('\n').map(l => l.trim()).filter(Boolean);
      return { objectives: lines, text: token.content || '' };
    }
    case 'REFERENCE_TABLE': {
      return { text: token.content || '' };
    }
    default:
      return base;
  }
}

module.exports = { buildTree };
