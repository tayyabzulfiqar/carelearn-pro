// BLS Course — static lesson data for Basic Life Support
// Images served from /bls/ (public/bls/). Lesson JSONs in src/data/bls/.
// Missing lesson numbers (07, 09, 14) are intentional — do not renumber.

import lesson01 from '@/data/bls/lesson_01.json';
import lesson02 from '@/data/bls/lesson_02.json';
import lesson03 from '@/data/bls/lesson_03.json';
import lesson04 from '@/data/bls/lesson_04.json';
import lesson05 from '@/data/bls/lesson_05.json';
import lesson06 from '@/data/bls/lesson_06.json';
import lesson08 from '@/data/bls/lesson_08.json';
import lesson10 from '@/data/bls/lesson_10.json';
import lesson11 from '@/data/bls/lesson_11.json';
import lesson12 from '@/data/bls/lesson_12.json';
import lesson13 from '@/data/bls/lesson_13.json';
import { getBlsAssessment } from '@/lib/bls-assessment';
import { normalizeLessonBlock } from '@/lib/lesson-blocks';

function adaptBlock(block, index) {
  const normalizedBlock = block.type === 'image' || block.type === 'hero_image'
    ? { ...block, src: `/bls/${block.src}` }
    : block;

  return normalizeLessonBlock(
    {
      ...normalizedBlock,
      id: `bls-block-${index}`,
    },
    index,
  );
}

function buildLesson(raw, lessonNum, moduleId, moduleTitle) {
  return {
    id: `bls-lesson-${lessonNum}`,
    lesson_number: lessonNum,
    title: raw.lessonTitle,
    module_id: moduleId,
    module_title: moduleTitle,
    content: {
      schema_version: 3,
      title: raw.lessonTitle,
      blocks: (raw.blocks || []).map((block, i) => adaptBlock(block, i)),
      metadata: { deterministic: true, source: 'bls_static' },
    },
  };
}

const MOD1 = { id: 'bls-mod-1', title: 'BLS Fundamentals' };
const MOD2 = { id: 'bls-mod-2', title: 'Cardiac Emergencies' };
const MOD3 = { id: 'bls-mod-3', title: 'Emergency Response Skills' };

const LESSONS = [
  buildLesson(lesson01,  1, MOD1.id, MOD1.title),
  buildLesson(lesson02,  2, MOD1.id, MOD1.title),
  buildLesson(lesson03,  3, MOD1.id, MOD1.title),
  buildLesson(lesson04,  4, MOD1.id, MOD1.title),
  buildLesson(lesson05,  5, MOD2.id, MOD2.title),
  buildLesson(lesson06,  6, MOD2.id, MOD2.title),
  buildLesson(lesson08,  8, MOD2.id, MOD2.title),
  buildLesson(lesson10, 10, MOD2.id, MOD2.title),
  buildLesson(lesson11, 11, MOD3.id, MOD3.title),
  buildLesson(lesson12, 12, MOD3.id, MOD3.title),
  buildLesson(lesson13, 13, MOD3.id, MOD3.title),
];

const MODULES = [
  { ...MOD1, lessons: LESSONS.filter((l) => l.module_id === MOD1.id) },
  { ...MOD2, lessons: LESSONS.filter((l) => l.module_id === MOD2.id) },
  { ...MOD3, lessons: LESSONS.filter((l) => l.module_id === MOD3.id) },
];

export const BLS_COURSE = {
  id: 'bls-basic-life-support',
  title: 'Basic Life Support (BLS)',
  pass_mark: getBlsAssessment().passMark,
  questions: getBlsAssessment().questions,
  modules: MODULES,
  lessons: LESSONS,
};
