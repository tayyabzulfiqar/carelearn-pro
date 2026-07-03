const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://carelearn-pro-api.vercel.app/api/v1';

function resolveAlias(specifier) {
  if (!specifier.startsWith('@/')) return specifier;
  return path.join(__dirname, '..', specifier.slice(2));
}

function transpileEsmToCjs(source, exportNames) {
  let transformed = source;

  transformed = transformed.replace(
    /import\s+([A-Za-z0-9_$]+)\s+from\s+['"]([^'"]+)['"];?/g,
    (_match, localName, specifier) => `const ${localName} = require(${JSON.stringify(resolveAlias(specifier))});`
  );

  transformed = transformed.replace(
    /import\s+\{\s*([^}]+)\s*\}\s+from\s+['"]([^'"]+)['"];?/g,
    (_match, names, specifier) => `const { ${names.trim()} } = require(${JSON.stringify(resolveAlias(specifier))});`
  );

  transformed = transformed.replace(/export\s+const\s+/g, 'const ');
  transformed = transformed.replace(/export\s+function\s+/g, 'function ');
  transformed = transformed.replace(/export\s+\{[^}]+\};?/g, '');

  transformed += `\nmodule.exports = { ${exportNames.join(', ')} };`;
  return transformed;
}

function loadEsmModule(modulePath, exportNames) {
  const absolutePath = path.resolve(modulePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const transformed = transpileEsmToCjs(source, exportNames);
  const loadedModule = new Module(absolutePath, module);
  loadedModule.filename = absolutePath;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(absolutePath));
  loadedModule._compile(transformed, absolutePath);
  return loadedModule.exports;
}

const lessonBlocks = loadEsmModule(
  path.join(__dirname, 'lesson-blocks.js'),
  [
    'BLOCK_TYPES',
    'prepareLessonPresentationBlocks',
    'resolveAssetUrl',
    'normalizeLessonBlock',
    'normalizeEditorDocument',
    'sanitizeText',
    'sanitizeBlockForSave',
    'serializeLessonDocument',
    'emptyBlock',
  ]
);

require.cache[path.join(__dirname, 'lesson-blocks.js')] = {
  exports: lessonBlocks,
};

const { normalizeAssessmentQuestions, getBlsAssessment, getAssessmentAttemptResolution } = loadEsmModule(
  path.join(__dirname, 'bls-assessment.js'),
  ['normalizeAssessmentQuestions', 'getBlsAssessment', 'getAssessmentAttemptResolution']
);

require.cache[path.join(__dirname, 'bls-assessment.js')] = {
  exports: {
    normalizeAssessmentQuestions,
    getBlsAssessment,
    getAssessmentAttemptResolution,
  },
};

const { BLS_COURSE } = loadEsmModule(
  path.join(__dirname, 'bls-course.js'),
  ['BLS_COURSE']
);

const { normalizeEditorDocument, prepareLessonPresentationBlocks } = lessonBlocks;

test('normalizes legacy numbered_steps blocks into shared step_list blocks', () => {
  const normalized = normalizeEditorDocument({
    title: 'Recovery Position',
    blocks: [
      { type: 'heading', text: 'Recovery Position' },
      {
        type: 'numbered_steps',
        steps: [
          { title: 'Step 1', text: 'Position the nearest arm.' },
          { title: 'Step 2', text: 'Roll the person onto their side.' },
        ],
      },
    ],
  }, 'Recovery Position');

  assert.equal(normalized.blocks[0].type, 'heading');
  assert.equal(normalized.blocks[1].type, 'step_list');
  assert.deepEqual(normalized.blocks[1].payload.steps, [
    'Position the nearest arm.',
    'Roll the person onto their side.',
  ]);
});

test('BLS adapter stays aligned with shared normalization for legacy lesson blocks', () => {
  const rawLesson = {
    lessonTitle: 'Legacy BLS',
    blocks: [
      { type: 'heading', text: 'Legacy BLS' },
      {
        type: 'numbered_steps',
        steps: [
          { title: 'Step 1', text: 'Check for danger.' },
          { title: 'Step 2', text: 'Call emergency services.' },
        ],
      },
      {
        type: 'learning_objectives',
        items: ['Keep the airway open', 'Monitor breathing'],
      },
    ],
  };

  const normalized = normalizeEditorDocument(rawLesson, rawLesson.lessonTitle);
  const blsEquivalent = BLS_COURSE.lessons.find((lesson) => lesson.lesson_number === 8);

  assert.deepEqual(
    normalized.blocks.map((block) => block.type),
    ['heading', 'step_list', 'objective_list']
  );
  assert.ok(blsEquivalent.content.blocks.some((block) => block.type === 'step_list'));
});

test('preserves structured lesson block types during shared normalization', () => {
  const normalized = normalizeEditorDocument({
    title: 'Structured Lesson',
    blocks: [
      {
        type: 'image_slot',
        payload: {
          imageId: 'IMG_101',
          position: 'full_width',
          ratio: '16:9',
          cdnUrl: '/course-assets/bls/IMG_101.webp',
          resolutionStatus: 'resolved',
        },
      },
      {
        type: 'reflection_prompts',
        payload: {
          text: 'What would you do differently next time?',
        },
      },
      {
        type: 'reference_table',
        payload: {
          text: 'NICE guidance and Resuscitation Council UK',
        },
      },
    ],
  }, 'Structured Lesson');

  assert.deepEqual(
    normalized.blocks.map((block) => block.type),
    ['image_slot', 'reflection_prompts', 'reference_table']
  );
});

test('mixed legacy and structured blocks normalize into one shared render pipeline', () => {
  const normalized = normalizeEditorDocument({
    title: 'Mixed Lesson',
    blocks: [
      { type: 'heading', text: 'Mixed Lesson' },
      {
        type: 'numbered_steps',
        steps: [
          { title: 'Step 1', text: 'Assess the situation.' },
        ],
      },
      {
        type: 'image_slot',
        payload: {
          imageId: 'IMG_202',
          position: 'centred_medium_width',
          ratio: '4:3',
          cdnUrl: '/course-assets/bls/IMG_202.webp',
          resolutionStatus: 'resolved',
        },
      },
      {
        type: 'reflection_prompts',
        payload: {
          text: 'How would you explain this to a colleague?',
        },
      },
    ],
  }, 'Mixed Lesson');

  const presented = prepareLessonPresentationBlocks(normalized.blocks);

  assert.deepEqual(
    normalized.blocks.map((block) => block.type),
    ['heading', 'step_list', 'image_slot', 'reflection_prompts']
  );
  assert.ok(presented.some((block) => block.type === 'step_list'));
  assert.ok(presented.some((block) => block.type === 'image_slot'));
  assert.ok(presented.some((block) => block.type === 'reflection_prompts'));
});

test('resolves uploaded lesson assets against the api origin', () => {
  assert.equal(
    lessonBlocks.resolveAssetUrl('/uploads/media/example-image.webp'),
    'https://carelearn-pro-api.vercel.app/uploads/media/example-image.webp'
  );
});
