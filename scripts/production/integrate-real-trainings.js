/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Client } = require('ssh2');

const VPS = {
  host: process.env.VPS_HOST || '187.127.105.253',
  port: Number(process.env.VPS_PORT || 22),
  username: process.env.VPS_USER || 'root',
  password: process.env.VPS_PASS || 'Abbasi@3155093759',
};

const COURSE_ROOT = process.env.HEALTHCARE_TRAININGS_ROOT || 'C:\\Users\\HP\\Desktop\\Healthcare trainings\\Nurse';

const COURSES = [
  {
    key: 'supervision',
    id: '70c6017d-9c8a-4434-8e5e-8e6d08e9b139',
    title: 'Supervision and Appraisal',
    slug: 'supervision-and-appraisal',
    description: 'Effective supervision and appraisal in health and social care: types and functions of supervision, appraisal and the appraisal process, performance management, difficult conversations, and record keeping.',
    category: 'Nurse',
    duration: 60,
    folder: 'Supervision and Appraisal',
    assetSlug: 'supervision-and-appraisal',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_20\.json$/i,
    // Master Image Prompt document references IMG_505.webp for lesson 307, but that asset
    // is not present on disk. Skip only the missing image and report it (all other images
    // map 1:1 to the authored filenames, so no remap is required).
    skipMissingImages: true,
  },
  {
    key: 'sepsis',
    id: '113631ab-2db3-4bac-8858-e06e339a86bd',
    title: 'Sepsis: Bitesize Learning',
    slug: 'sepsis-bitesize-learning',
    description: 'Bitesize sepsis awareness for healthcare and care staff: what sepsis is, causes, symptoms, risk factors, screening tools and safe management and escalation.',
    category: 'Nurse',
    duration: 20,
    folder: 'Sepsis Bitesize Learning',
    assetSlug: 'sepsis-bitesize-learning',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_sepsis_bitesize_learning\.json$/i,
    // Authored lesson JSON references placeholder image names (IMG_<lessonNumber>.webp)
    // that do not exist on disk. The Master Image Prompt document is authoritative and
    // maps each lesson to the real asset file. Applied in-memory only (source JSON files
    // are never modified, images are never renamed, nothing moves between lessons).
    imageOverrides: {
      282: ['IMG_473.webp'],
      283: ['IMG_474.webp'],
      284: ['IMG_475.webp'],
      285: ['IMG_476.webp'],
      286: ['IMG_477.webp'],
      287: ['IMG_478.webp'],
      288: ['IMG_479.webp'],
      289: ['IMG_480.webp'],
      290: ['IMG_481.webp'],
      291: ['IMG_482.webp'],
      292: ['IMG_483.webp'],
    },
  },
  {
    key: 'movinghandling',
    id: 'fde31da9-c229-4f7e-bdf7-c85f4619b046',
    title: 'Moving and Handling Theory (L1 & L2)',
    slug: 'moving-and-handling-theory',
    description: 'Theory and legislation behind safe moving and handling practice: risk assessment, body mechanics, core stability, spinal protection, equipment, LOLER, and incident reporting in healthcare settings.',
    category: 'Nurse',
    duration: 60,
    folder: 'Moving and Handling Theory (L1 & L2)',
    assetSlug: 'moving-and-handling-theory',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_moving_and_handling_theory\.json$/i,
  },
  {
    key: 'healthsafety',
    id: '817950ac-da8f-4cc3-8344-295c1a5c8276',
    title: 'Health, Safety and Welfare (inc COSHH & RIDDOR)',
    slug: 'health-safety-welfare-coshh-riddor',
    description: 'Comprehensive health, safety and welfare training covering COSHH hazardous substances management and RIDDOR incident reporting for healthcare settings.',
    category: 'Nurse',
    duration: 90,
    folder: 'Health, Safety and Welfare (inc COSHH & RIDDOR)',
    assetSlug: 'health-safety-welfare',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'foodhygiene',
    id: '10f6c183-7e20-493e-9863-a6d576e5440f',
    title: 'Food Hygiene',
    slug: 'food-hygiene',
    description: 'Core food hygiene principles, contamination prevention, and safe handling in healthcare settings.',
    category: 'Nurse',
    duration: 75,
    folder: 'Food Hygiene',
    assetSlug: 'food-hygiene',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'firstaid',
    id: 'e5c7342d-ffae-46f6-bcb6-e943760e5b40',
    title: 'First Aid',
    slug: 'first-aid',
    description: 'Essential first aid response, assessment, and emergency care in healthcare settings.',
    category: 'Nurse',
    duration: 90,
    folder: 'First Aid',
    assetSlug: 'first-aid',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'firesafety',
    id: '91fd81e6-f9d9-4dda-9d91-5fbc07f22f37',
    title: 'Fire Safety',
    slug: 'fire-safety',
    description: 'Healthcare fire safety awareness, prevention, response, and compliance practice.',
    category: 'Nurse',
    duration: 90,
    folder: 'Fire Safety',
    assetSlug: 'fire-safety',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'bls',
    id: 'b721b5b7-bf9e-4c44-b89d-ede14a5e7bf7',
    title: 'Basic Life Support',
    slug: 'basic-life-support',
    description: 'Essential emergency response and life support training.',
    category: 'Nurse',
    duration: 60,
    folder: 'Basic Life Support',
    assetSlug: 'bls',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'epilepsy',
    id: '3da8ba5f-1a6d-4de9-8de9-1f9db5cc32c4',
    title: 'Caring for Someone with Epilepsy',
    slug: 'caring-for-someone-with-epilepsy',
    description: 'Practical epilepsy care, seizure recognition and safe response.',
    category: 'Nurse',
    duration: 75,
    folder: 'Caring for Someone with Epilepsy',
    assetSlug: 'epilepsy',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'catheter',
    id: 'f9fe3f1e-2c4c-49d1-bb6f-9ecbc6a95f8a',
    title: 'Catheter Care',
    slug: 'catheter-care',
    description: 'Safe catheter insertion, maintenance, complication prevention and documentation best practice.',
    category: 'Nurse',
    duration: 75,
    folder: 'Catheter Care',
    assetSlug: 'catheter-care',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'conflict',
    id: '3d85e58e-dc48-4b10-a298-8e33332326d0',
    title: 'Conflict Resolution and Complaints Handling',
    slug: 'conflict-resolution-and-complaints-handling',
    description: 'Practical conflict prevention, de-escalation, incident support and complaints handling for healthcare teams.',
    category: 'Nurse',
    duration: 90,
    folder: 'Conflict Resolution and Complaints Handling',
    assetSlug: 'conflict-resolution-complaints-handling',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'dementia',
    id: '218fd893-1f3a-41ef-acdc-785a73f5bfaf',
    title: 'Dementia Level 1',
    slug: 'dementia-level-1',
    description: 'Foundational dementia awareness, communication, environment and person-centred care in healthcare settings.',
    category: 'Nurse',
    duration: 60,
    folder: 'Dementia Level 1',
    assetSlug: 'dementia-level-1',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'endoflife',
    id: 'ae24c1d2-4afa-48f0-a17e-db234dd7f0f7',
    title: 'End of Life Care',
    slug: 'end-of-life-care',
    description: 'Compassionate end of life support, symptom management, communication and bereavement care in healthcare settings.',
    category: 'Nurse',
    duration: 90,
    folder: 'End of Life Care',
    assetSlug: 'end-of-life-care',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'equality',
    id: '6a20c887-9d52-4b73-aff4-fc8d1e193f9d',
    title: 'Equality, Diversity & LGBTQ+',
    slug: 'equality-diversity-and-lgbtq',
    description: 'Core equality, diversity, inclusion, human rights and LGBTQ+ awareness for healthcare practice.',
    category: 'Nurse',
    duration: 75,
    folder: 'Equality, Diversity & LGBTQ+',
    assetSlug: 'equality-diversity-lgbtq',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_\d+\.json$/i,
  },
  {
    key: 'infogov',
    id: 'd6a8df31-4f99-4368-92ca-591280f0de15',
    title: 'Information Governance, Data Protection & GDPR',
    slug: 'information-governance-data-protection-gdpr',
    description: 'Information governance, data protection and GDPR for healthcare: data security principles, breach identification and reporting, Caldicott principles, record keeping, and individual rights.',
    category: 'Nurse',
    duration: 75,
    folder: 'Information Governance, Data Protection & GDPR',
    assetSlug: 'information-governance-data-protection-and-gdpr',
    passMark: 75,
    mandatory: true,
    assessmentPattern: /^assessment_13\s*\.json$/i,
  },
];

const DEMO = {
  email: 'demo.learner@carelearn.local',
  password: 'DemoLearner123!',
  firstName: 'Demo',
  lastName: 'Learner',
};

const REQUESTED_KEYS = String(process.env.COURSE_KEYS || '')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean);
const IMPORT_MODE = String(process.env.IMPORT_MODE || 'full').trim().toLowerCase();
const ASSETS_ONLY = String(process.env.ASSETS_ONLY || '').trim().toLowerCase() === 'true';
const LESSON_MIN = Number(process.env.LESSON_MIN || 0);
const LESSON_MAX = Number(process.env.LESSON_MAX || 0);
const ASSESSMENT_FILE = String(process.env.ASSESSMENT_FILE || '').trim();
const RESET_LEARNER_DATA = String(process.env.RESET_LEARNER_DATA || '').trim().toLowerCase() === 'true';

function exec(conn, command, timeout = 300000) {
  return new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const t = setTimeout(() => reject(new Error(`timeout: ${command.slice(0, 120)}`)), timeout);
    conn.exec(command, (e, stream) => {
      if (e) {
        clearTimeout(t);
        reject(e);
        return;
      }
      stream.on('close', (code) => {
        clearTimeout(t);
        resolve({ code, out: out.trim(), err: err.trim() });
      });
      stream.on('data', (d) => { out += d.toString(); });
      stream.stderr.on('data', (d) => { err += d.toString(); });
    });
  });
}

function writeRemoteFile(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath, { flags: 'w', encoding: 'utf8', mode: 0o644 });
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.end(content);
    });
  });
}

function writeRemoteBuffer(conn, remotePath, contentBuffer) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath, { flags: 'w', mode: 0o644 });
      stream.on('error', reject);
      stream.on('close', resolve);
      stream.end(contentBuffer);
    });
  });
}

function getSftp(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      resolve(sftp);
    });
  });
}

function sqlEsc(v) {
  return String(v ?? '').replace(/'/g, "''");
}

function toCanonicalType(type, block) {
  const t = String(type || '').toLowerCase().trim();
  if (t === 'heading') return 'heading';
  if (t === 'paragraph' || t === 'rich_text') return 'rich_text';
  if (t === 'hero_image' || t === 'image') return 'image';
  if (t === 'learning_objectives' || t === 'objective_list' || t === 'bulleted_list' || t === 'bullet_list') return 'objective_list';
  if (Array.isArray(block?.items) && block.items.length) return 'objective_list';
  return 'rich_text';
}

function canonicalImageName(name = '') {
  const raw = String(name || '').trim();
  const m = raw.match(/^IMG[\s_]*(\d+)\.(webp|png|jpg|jpeg)$/i);
  if (!m) return '';
  return `IMG_${Number(m[1])}.${m[2].toLowerCase()}`;
}

function buildAssetIndex(rootDir) {
  const index = new Map();
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      const key = canonicalImageName(entry.name);
      if (key && !index.has(key)) index.set(key, full);
    }
  }
  return index;
}

function listCourseImageNames(courseDir) {
  return fs.readdirSync(courseDir)
    .filter((f) => !!canonicalImageName(f))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
}

function addTextBlock(blocks, type, value) {
  const text = String(value || '').trim();
  if (!text) return;
  blocks.push({ type, text });
}

function addListBlock(blocks, items) {
  const cleanItems = Array.isArray(items) ? items.map((x) => String(x).trim()).filter(Boolean) : [];
  if (cleanItems.length) blocks.push({ type: 'bulleted_list', items: cleanItems });
}

function blocksFromSourceCapture(raw) {
  const blocks = [];
  const title = String(raw?.lessonTitle || raw?.title || '').trim();
  addTextBlock(blocks, 'heading', title);

  addTextBlock(blocks, 'heading', raw?.subtitle);
  addListBlock(blocks, raw?.learningObjectives);

  for (const section of Array.isArray(raw?.content) ? raw.content : []) {
    addTextBlock(blocks, 'heading', section?.heading);
    for (const paragraph of Array.isArray(section?.paragraphs) ? section.paragraphs : []) {
      addTextBlock(blocks, 'paragraph', paragraph);
    }
    addListBlock(blocks, section?.bullets);
  }

  for (const image of Array.isArray(raw?.images) ? raw.images : []) {
    const filename = String(image?.filename || '').trim();
    if (!filename) continue;
    blocks.push({
      type: 'image',
      src: filename,
      alt: String(image?.alt || '').trim(),
      caption: String(image?.caption || '').trim(),
    });
  }

  if (blocks.length > 1) return blocks;

  for (const section of Array.isArray(raw?.sections) ? raw.sections : []) {
    addTextBlock(blocks, 'heading', section?.text);
  }
  for (const paragraph of Array.isArray(raw?.paragraphs) ? raw.paragraphs : []) {
    const text = String(paragraph || '').trim();
    if (/^Chapter\s+\d+\s+of\s+\d+$/i.test(text)) continue;
    addTextBlock(blocks, 'paragraph', text);
  }
  for (const list of Array.isArray(raw?.bulletLists) ? raw.bulletLists : []) {
    addListBlock(blocks, list);
  }
  for (const list of Array.isArray(raw?.numberedLists) ? raw.numberedLists : []) {
    addListBlock(blocks, list);
  }
  for (const note of Array.isArray(raw?.notes) ? raw.notes : []) {
    addTextBlock(blocks, 'paragraph', note);
  }
  for (const warning of Array.isArray(raw?.warnings) ? raw.warnings : []) {
    addTextBlock(blocks, 'paragraph', warning);
  }
  for (const definition of Array.isArray(raw?.definitions) ? raw.definitions : []) {
    if (typeof definition === 'string') {
      addTextBlock(blocks, 'paragraph', definition);
    } else {
      addTextBlock(blocks, 'paragraph', [definition?.term, definition?.definition].filter(Boolean).join(': '));
    }
  }
  for (const table of Array.isArray(raw?.tables) ? raw.tables : []) {
    addTextBlock(blocks, 'paragraph', JSON.stringify(table));
  }

  if (blocks.length > 1) return blocks;

  const lines = Array.isArray(raw?.lessonContent?.lines) ? raw.lessonContent.lines : [];
  const start = lines.findIndex((line) => String(line || '').trim() === title);
  const contentLines = (start >= 0 ? lines.slice(start + 1) : lines)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => !/^(Home|Courses|Collections|My Learning|Portfolio|My Account|Course menu|Overview|Chapters|Assessment|Next chapter|Previous chapter|Take course assessment)$/i.test(line))
    .filter((line) => !/^\d+\s+-\s+/.test(line));

  for (const line of contentLines) {
    if (line !== title) addTextBlock(blocks, 'paragraph', line);
  }

  return blocks;
}

function normalizeBlock(block, idx, imageSet, assetIndex, issues, lessonFile, skipMissing, missingImages) {
  const canonical = toCanonicalType(block?.type, block);
  const base = {
    id: crypto.randomUUID(),
    order: idx,
    meta: { analyticsKey: `${block?.type || canonical}_${idx + 1}`, tags: [], aiHints: { semanticRole: '', summary: '', difficulty: '' } },
  };

  if (canonical === 'heading') {
    return { ...base, type: 'heading', payload: { text: String(block?.text || '').trim(), level: 2 } };
  }

  if (canonical === 'rich_text') {
    const text = String(block?.text || block?.content || '').trim();
    return { ...base, type: 'rich_text', payload: { text: text || JSON.stringify(block || {}) } };
  }

  if (canonical === 'objective_list') {
    const objectives = Array.isArray(block?.items) ? block.items.map((x) => String(x).trim()).filter(Boolean) : [];
    return { ...base, type: 'objective_list', payload: { objectives, text: '' } };
  }

  const rawSrc = String(block?.src || block?.image || block?.filename || block?.payload?.src || '').trim();
  const fileName = rawSrc.split('/').pop();
  const canonicalName = canonicalImageName(fileName);
  const isMissing = canonicalName && !imageSet.has(canonicalName) && !assetIndex.has(canonicalName);
  if (isMissing) {
    if (Array.isArray(missingImages)) missingImages.push({ lessonFile, fileName: canonicalName });
    if (skipMissing) {
      // Authoritative master doc references an image with no asset on disk: drop this
      // image block (it will be reported as skipped) rather than failing the import.
      return { ...base, type: 'image', __skipMissing: true, payload: { src: rawSrc } };
    }
    issues.push(`${lessonFile}: missing image asset ${fileName}`);
  }
  return {
    ...base,
    type: 'image',
    payload: {
      src: rawSrc,
      alt: String(block?.alt || '').trim(),
      caption: String(block?.caption || '').trim(),
      width: 100,
      align: 'center',
    },
  };
}

function parseJsonFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const utf8 = buf.toString('utf8').replace(/^\uFEFF/, '').trim();
  try { return JSON.parse(utf8); } catch {}
  const utf16 = buf.toString('utf16le').replace(/^\uFEFF/, '').trim();
  return JSON.parse(utf16);
}

function applyImageOverrides(raw, lessonNumber, overrides) {
  if (!overrides) return raw;
  const list = overrides[lessonNumber];
  if (!Array.isArray(list) || !list.length) return raw;
  let imgIdx = 0;
  if (Array.isArray(raw.images)) {
    raw.images = raw.images.map((im) => {
      if (imgIdx < list.length) {
        const filename = list[imgIdx];
        imgIdx += 1;
        return { ...im, filename };
      }
      return im;
    });
  }
  let blockIdx = 0;
  if (Array.isArray(raw.blocks)) {
    raw.blocks = raw.blocks.map((b) => {
      const t = String(b?.type || '').toLowerCase();
      if (t === 'image' || t === 'hero_image') {
        if (blockIdx < list.length) {
          const filename = list[blockIdx];
          blockIdx += 1;
          return { ...b, src: filename, image: filename, filename };
        }
      }
      return b;
    });
  }
  return raw;
}

function validateAndParseLessons(courseDir, assetIndex, imageOverrides, skipMissingImages) {
  const files = fs.readdirSync(courseDir);
  const lessonFiles = files.filter((f) => /^lesson_\d+\.json$/i.test(f))
    .filter((f) => {
      if (!LESSON_MIN && !LESSON_MAX) return true;
      const n = Number(f.match(/\d+/)?.[0] || 0);
      if (LESSON_MIN && n < LESSON_MIN) return false;
      if (LESSON_MAX && n > LESSON_MAX) return false;
      return true;
    })
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const imageFiles = files.filter((f) => !!canonicalImageName(f));
  const imageSet = new Set(imageFiles.map((f) => canonicalImageName(f)).filter(Boolean));

  const issues = [];
  const warnings = [];
  if (!lessonFiles.length) issues.push('No lesson_*.json files found.');

  const numbers = lessonFiles.map((f) => Number(f.match(/\d+/)[0]));
  const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
  if (duplicates.length) issues.push(`Duplicate lesson numbers detected: ${[...new Set(duplicates)].join(', ')}`);

  if (numbers.length) {
    const min = Math.min(...numbers);
    const max = Math.max(...numbers);
    const missing = [];
    for (let i = min; i <= max; i++) if (!numbers.includes(i)) missing.push(i);
    if (missing.length) warnings.push(`Missing lesson numbers in source range ${min}-${max}: ${missing.join(', ')}`);
  }

  const lessons = [];
  const referencedImages = new Set();
  const missingImages = [];
  lessonFiles.forEach((file, sortedIndex) => {
    const lessonPath = path.join(courseDir, file);
    let raw;
    try {
      raw = parseJsonFile(lessonPath);
    } catch {
      issues.push(`${file}: malformed JSON`);
      return;
    }

    const fileNumber = Number(file.match(/\d+/)?.[0] || 0);
    raw = applyImageOverrides(raw, fileNumber, imageOverrides);

    const rawBlocks = Array.isArray(raw.blocks) ? raw.blocks : blocksFromSourceCapture(raw);
    if (!rawBlocks.length) {
      issues.push(`${file}: no blocks array content`);
      return;
    }

    const title = String(raw.lessonTitle || raw.title || '').trim() || `Lesson ${sortedIndex + 1}`;
    const sourceNumber = Number(raw.lessonNumber || file.match(/\d+/)?.[0] || sortedIndex + 1);
    const durationMinutes = Number(String(raw.lessonDuration || '').match(/\d+/)?.[0] || 5);

    const blocks = rawBlocks
      .map((b, idx) => normalizeBlock(b, idx, imageSet, assetIndex, issues, file, skipMissingImages, missingImages))
      .filter((b) => !b.__skipMissing)
      .map((b, idx) => ({ ...b, order: idx }));
    for (const block of blocks) {
      if (block.type === 'image') {
        const src = String(block.payload?.src || '').trim();
        const name = src.split('/').pop();
        const normalized = canonicalImageName(name);
        if (normalized) referencedImages.add(normalized);
      }
    }

    lessons.push({
      title,
      sourceFile: file,
      sourceNumber: Number(file.match(/\d+/)[0]),
      lessonNumber: sourceNumber,
      durationMinutes,
      content: {
        schema_version: 3,
        title,
        blocks,
        metadata: { locale: 'en', readingMinutes: durationMinutes, tags: [], sourceLessonNumber: sourceNumber },
      },
    });
  });

  const orphanImages = imageFiles.filter((img) => !referencedImages.has(canonicalImageName(img)));
  if (orphanImages.length) warnings.push(`Orphan images not referenced by lesson JSON: ${orphanImages.join(', ')}`);

  return {
    lessons,
    lessonFiles,
    lessonNumbers: numbers,
    imageFiles,
    referencedImages: [...referencedImages],
    orphanImages,
    missingImages,
    issues,
    warnings,
  };
}

function rewriteImageSrcForPublic(lessons, assetSlug) {
  return lessons.map((lesson) => ({
    ...lesson,
    content: {
      ...lesson.content,
      blocks: lesson.content.blocks.map((block) => {
        if (block.type !== 'image') return block;
        const src = String(block.payload?.src || '').trim();
        if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('/')) return block;
        const name = src.split('/').pop();
        return {
          ...block,
          payload: { ...block.payload, src: `/course-assets/${assetSlug}/${name}` },
        };
      }),
    },
  }));
}

function collectReferencedImageNames(lessons) {
  const names = new Set();
  for (const lesson of lessons) {
    const blocks = lesson?.content?.blocks || [];
    for (const block of blocks) {
      if (block?.type !== 'image') continue;
      const src = String(block?.payload?.src || '').trim();
      const name = src.split('/').pop();
      if (name) names.add(name);
    }
  }
  return [...names];
}

async function syncCourseAssets(conn, course, lessons) {
  const referencedNames = collectReferencedImageNames(lessons);
  const courseImageNames = listCourseImageNames(course.dir);
  const names = [...new Set([...referencedNames, ...courseImageNames])];
  const localDir = course.dir;
  const hostDir = `/root/carelearn-pro/apps/web/public/course-assets/${course.assetSlug}`;
  const assetIndex = buildAssetIndex(COURSE_ROOT);

  await exec(conn, `mkdir -p ${hostDir}`);
  const sftp = await getSftp(conn);

  const missingLocal = [];
  for (const name of names) {
    const directPath = path.join(localDir, name);
    const canonical = canonicalImageName(name);
    const indexedPath = canonical ? assetIndex.get(canonical) : null;
    const localPath = fs.existsSync(directPath) ? directPath : indexedPath;
    if (!localPath || !fs.existsSync(localPath)) {
      missingLocal.push(name);
      continue;
    }
    await new Promise((resolve, reject) => {
      sftp.fastPut(localPath, `${hostDir}/${name}`, {}, (err) => (err ? reject(err) : resolve()));
    });
  }

  const verify = await exec(conn, `cd /root/carelearn-pro && ls -1 apps/web/public/course-assets/${course.assetSlug} | wc -l`);
  const hostCount = Number(String(verify.out || '0').trim() || 0);
  return {
    referenced: referencedNames.length,
    discovered: courseImageNames.length,
    uploaded: names.length - missingLocal.length,
    missingLocal,
    hostCount,
  };
}

function parseAssessments(courseDir, pattern, courseKey) {
  const files = fs.readdirSync(courseDir)
    .filter((f) => pattern.test(f))
    .filter((f) => !ASSESSMENT_FILE || f.toLowerCase() === ASSESSMENT_FILE.toLowerCase())
    .sort();
  const issues = [];
  const warnings = [];
  const questions = [];

  files.forEach((file) => {
    const assessmentPath = path.join(courseDir, file);
    let raw;
    try {
      raw = parseJsonFile(assessmentPath);
    } catch {
      issues.push(`${file}: malformed JSON`);
      return;
    }
    const questionsRaw = Array.isArray(raw.questions)
      ? raw.questions
      : (Array.isArray(raw.assessment) ? raw.assessment : []);

    if (!questionsRaw.length) {
      warnings.push(`${file}: no questions array`);
      return;
    }

    questionsRaw.forEach((q, i) => {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        issues.push(`${file} question ${i + 1}: options must have at least 2 entries`);
        return;
      }
      const optionsAreObjects = q.options.every((o) => typeof o === 'object' && o !== null);
      const options = optionsAreObjects
        ? q.options.map((o) => String(o?.text || '').trim())
        : q.options.map((o) => String(o || '').trim());

      let correctAnswer = q.options.findIndex((o) => Boolean(o?.isCorrect || o?.correct));
      if (correctAnswer < 0 && Array.isArray(q.correct_answers) && q.correct_answers.length) {
        correctAnswer = Number(q.correct_answers[0]);
        if (q.correct_answers.length > 1) {
          warnings.push(`${file} question ${i + 1}: multiple correct_answers provided; using first index ${correctAnswer} for single-answer runtime compatibility`);
        }
      }
      if (correctAnswer < 0 && Number.isInteger(q.correct_answer)) {
        correctAnswer = Number(q.correct_answer);
      }
      if (correctAnswer < 0 && Number.isInteger(q.correctAnswer)) {
        correctAnswer = Number(q.correctAnswer);
      }
      if (correctAnswer < 0 && typeof q.answer === 'string') {
        const normalizedAnswer = q.answer.trim().toLowerCase();
        correctAnswer = options.findIndex((opt) => String(opt || '').trim().toLowerCase() === normalizedAnswer);
      }
      if (correctAnswer < 0 || correctAnswer >= options.length) {
        issues.push(`${file} question ${i + 1}: missing correct option`);
        return;
      }
      questions.push({
        questionText: String(q.question || `Question ${i + 1}`).trim(),
        options,
        correctAnswer,
        explanation: String(q.options[correctAnswer]?.explanation || q.explanation || '').trim(),
        orderIndex: questions.length,
        difficulty: 'medium',
        questionKey: `${courseKey}-final-${questions.length + 1}`,
      });
    });
  });

  return { files, questions, issues, warnings };
}

function buildSql({ normalizedCourses, demoPasswordHash }) {
  const now = new Date().toISOString();
  const orgId = crypto.randomUUID();
  const demoUserId = crypto.randomUUID();

  const keepIds = normalizedCourses.map((c) => `'${c.id}'`).join(', ');

  let sql = `\nBEGIN;\n\n`;

  sql += `
INSERT INTO organisations (id, name, slug, is_active)
SELECT '${orgId}', 'CareLearn Demo Org', 'carelearn-demo-org', true
WHERE NOT EXISTS (SELECT 1 FROM organisations);

INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
SELECT '${demoUserId}', '${DEMO.email}', '${sqlEsc(demoPasswordHash)}', '${DEMO.firstName}', '${DEMO.lastName}', 'learner', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='${DEMO.email}');

UPDATE users
SET password_hash='${sqlEsc(demoPasswordHash)}', first_name='${DEMO.firstName}', last_name='${DEMO.lastName}', role='learner', is_active=true, updated_at=NOW()
WHERE email='${DEMO.email}';
`;

  if (IMPORT_MODE === 'full') {
    sql += `
DELETE FROM progress WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id NOT IN (${keepIds})
);
DELETE FROM assessment_attempts WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id NOT IN (${keepIds})
);
DELETE FROM certificates WHERE course_id NOT IN (${keepIds});
DELETE FROM assessment_questions WHERE course_id NOT IN (${keepIds});
DELETE FROM enrollments WHERE course_id NOT IN (${keepIds});
DELETE FROM progress WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id IN (${keepIds})
);
DELETE FROM assessment_attempts WHERE enrollment_id IN (
  SELECT e.id FROM enrollments e WHERE e.course_id IN (${keepIds})
);
DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id NOT IN (${keepIds}));
DELETE FROM modules WHERE course_id NOT IN (${keepIds});
DELETE FROM courses WHERE id NOT IN (${keepIds});
`;
  }

  for (const course of normalizedCourses) {
    sql += `
INSERT INTO courses (id, title, slug, description, category, duration_minutes, renewal_years, pass_mark, is_mandatory, status)
VALUES ('${course.id}', '${sqlEsc(course.title)}', '${course.slug}', '${sqlEsc(course.description)}', '${course.category}', ${course.duration}, 1, ${course.passMark}, ${course.mandatory ? 'true' : 'false'}, 'published')
ON CONFLICT (id) DO UPDATE SET
  title=EXCLUDED.title,
  slug=EXCLUDED.slug,
  description=EXCLUDED.description,
  category=EXCLUDED.category,
  duration_minutes=EXCLUDED.duration_minutes,
  renewal_years=EXCLUDED.renewal_years,
  pass_mark=EXCLUDED.pass_mark,
  is_mandatory=EXCLUDED.is_mandatory,
  status='published',
  updated_at=NOW();
`;

    const moduleId = crypto.randomUUID();

    // Re-publishing replaces this course's lessons under fresh ids, and progress
    // rows reference them. IMPORT_MODE=full already clears progress above; every
    // other mode would otherwise die on progress_lesson_id_fkey with an
    // unactionable raw FK error. Same guard as recovery-course-publisher.js:
    // refuse unless the caller opts in, and keep every delete scoped to this
    // course's own enrollments. The whole script runs inside one transaction, so
    // a refusal rolls back and leaves the existing course untouched.
    if (IMPORT_MODE !== 'full') {
      sql += RESET_LEARNER_DATA
        ? `
DELETE FROM progress WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id='${course.id}');
DELETE FROM assessment_attempts WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id='${course.id}');
DELETE FROM certificates WHERE course_id='${course.id}';
`
        : `
DO $guard$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM progress
   WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id='${course.id}');
  IF n > 0 THEN
    RAISE EXCEPTION
      'course ${course.id} (${sqlEsc(course.title)}) has % learner progress rows referencing its lessons. Re-run with RESET_LEARNER_DATA=true to clear this course''s own progress, attempts and certificates first.', n;
  END IF;
END
$guard$;
`;
    }

    sql += `
DELETE FROM assessment_questions WHERE course_id='${course.id}';
DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id='${course.id}');
DELETE FROM modules WHERE course_id='${course.id}';

INSERT INTO modules (id, course_id, title, description, status, order_index)
VALUES ('${moduleId}', '${course.id}', 'Core Lessons', '${sqlEsc(course.title)} lesson sequence', 'published', 0);
`;

    for (const lesson of course.lessons) {
      sql += `
INSERT INTO lessons (id, module_id, title, content, status, is_visible, order_index, duration_minutes, published_at)
VALUES ('${crypto.randomUUID()}', '${moduleId}', '${sqlEsc(lesson.title)}', '${sqlEsc(JSON.stringify(lesson.content))}'::jsonb, 'published', true, ${lesson.lessonNumber - 1}, ${lesson.durationMinutes}, NOW());
`;
    }

    for (const q of course.assessmentQuestions) {
      sql += `
INSERT INTO assessment_questions (
  id, course_id, module_id, lesson_number, question_text, question_type, options,
  correct_answer, explanation, difficulty, is_final_assessment, is_active,
  version_tag, question_key, option_order, order_index
) VALUES (
  '${crypto.randomUUID()}', '${course.id}', '${moduleId}', NULL, '${sqlEsc(q.questionText)}', 'multiple_choice',
  '${sqlEsc(JSON.stringify(q.options))}'::jsonb, ${q.correctAnswer}, '${sqlEsc(q.explanation)}', '${q.difficulty}', true, true,
  'prod-real-courses-${now}', '${sqlEsc(q.questionKey)}', '${sqlEsc(JSON.stringify(q.options.map((_, idx) => idx)))}'::jsonb, ${q.orderIndex}
);
`;
    }

    sql += `
INSERT INTO organisation_members (id, organisation_id, user_id, role)
SELECT '${crypto.randomUUID()}', (SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1), u.id, 'learner'
FROM users u WHERE u.email='${DEMO.email}'
ON CONFLICT (organisation_id, user_id) DO NOTHING;

INSERT INTO enrollments (id, user_id, course_id, organisation_id, status)
SELECT '${crypto.randomUUID()}', u.id, '${course.id}', (SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1), 'enrolled'
FROM users u WHERE u.email='${DEMO.email}'
ON CONFLICT (user_id, course_id) DO NOTHING;
`;
  }

  sql += '\nCOMMIT;\n';
  return sql;
}

async function run() {
  const selectedCourses = REQUESTED_KEYS.length
    ? COURSES.filter((c) => REQUESTED_KEYS.includes(c.key))
    : COURSES;
  if (!selectedCourses.length) {
    throw new Error(`No courses selected. COURSE_KEYS=${REQUESTED_KEYS.join(',')}`);
  }

  const sourceCourses = selectedCourses.map((c) => ({ ...c, dir: path.join(COURSE_ROOT, c.folder) }));
  for (const c of sourceCourses) {
    if (!fs.existsSync(c.dir)) throw new Error(`Missing course folder: ${c.dir}`);
  }

  const validation = { at: new Date().toISOString(), root: COURSE_ROOT, courses: [] };
  const normalizedCourses = [];
  const assetIndex = buildAssetIndex(COURSE_ROOT);

  for (const c of sourceCourses) {
    const lessonValidation = validateAndParseLessons(c.dir, assetIndex, c.imageOverrides, c.skipMissingImages);
    const assessmentValidation = parseAssessments(c.dir, c.assessmentPattern, c.key);

    const missingImages = lessonValidation.missingImages || [];
    const missingImageWarnings = missingImages.map((m) => `${m.lessonFile}: image asset ${m.fileName} referenced by master mapping but missing on disk — skipped`);

    const allIssues = [...lessonValidation.issues, ...assessmentValidation.issues];
    const allWarnings = [...lessonValidation.warnings, ...assessmentValidation.warnings, ...missingImageWarnings];

    validation.courses.push({
      key: c.key,
      id: c.id,
      title: c.title,
      folder: c.folder,
      lesson_files: lessonValidation.lessonFiles,
      lesson_numbers_source: lessonValidation.lessonNumbers,
      lesson_count_normalized: lessonValidation.lessons.length,
      assessment_files: assessmentValidation.files,
      assessment_question_count: assessmentValidation.questions.length,
      image_files: lessonValidation.imageFiles,
      image_ref_count: lessonValidation.referencedImages.length,
      orphan_images: lessonValidation.orphanImages,
      skipped_missing_images: missingImages,
      issues: allIssues,
      warnings: allWarnings,
      normalized_numbering: lessonValidation.lessons.map((l) => ({ source_file: l.sourceFile, source_number: l.sourceNumber, normalized_number: l.lessonNumber })),
    });

    if (allIssues.length) {
      throw new Error(`Validation failed for ${c.title}: ${allIssues.join(' | ')}`);
    }

    normalizedCourses.push({
      ...c,
      lessons: rewriteImageSrcForPublic(lessonValidation.lessons, c.assetSlug),
      assessmentQuestions: assessmentValidation.questions,
    });
  }

  validation.summary = {
    total_courses: normalizedCourses.length,
    warnings_total: validation.courses.reduce((n, c) => n + c.warnings.length, 0),
    issues_total: 0,
  };

  fs.mkdirSync(path.resolve(process.cwd(), 'cleanup-reports'), { recursive: true });
  const validationReportPath = path.resolve(process.cwd(), 'cleanup-reports', `real-training-validation-${Date.now()}.json`);
  fs.writeFileSync(validationReportPath, JSON.stringify(validation, null, 2));

  const demoPasswordHash = await bcrypt.hash(DEMO.password, 12);
  const sql = buildSql({ normalizedCourses, demoPasswordHash });
  const sqlPath = path.resolve(process.cwd(), 'cleanup-reports', `real-training-integration-${Date.now()}.sql`);
  fs.writeFileSync(sqlPath, sql);

  const conn = new Client();
  await new Promise((resolve, reject) => {
    conn.on('ready', resolve).on('error', reject).connect({ ...VPS, readyTimeout: 30000 });
  });

  try {
    const assetSync = [];
    for (const c of normalizedCourses) {
      const result = await syncCourseAssets(conn, c, c.lessons);
      assetSync.push({ key: c.key, assetSlug: c.assetSlug, ...result });
    }

    const webDeployCmd = 'cd /root/carelearn-pro && docker compose -f docker-compose.production.yml --env-file .env.production build web && docker compose -f docker-compose.production.yml --env-file .env.production up -d web nginx';
    const webDeploy = await exec(conn, webDeployCmd, 900000);
    if (webDeploy.code !== 0) throw new Error(webDeploy.err || 'Failed to rebuild/restart web service');

    if (ASSETS_ONLY) {
      const report = {
        at: new Date().toISOString(),
        mode: 'assets_only',
        source_root: COURSE_ROOT,
        courses: normalizedCourses.map((c) => ({ key: c.key, id: c.id, lessons: c.lessons.length })),
        asset_sync: assetSync,
        web_deploy: webDeploy.out || webDeploy.err,
      };
      const reportPath = path.resolve(process.cwd(), 'cleanup-reports', `real-training-assets-sync-report-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`Asset sync complete.\nReport: ${reportPath}`);
      return;
    }

    await exec(conn, 'mkdir -p /root/carelearn-pro/backups');
    const remoteSql = '/root/carelearn-pro/backups/real-training-integration.sql';
    await writeRemoteFile(conn, remoteSql, sql);

    const runCmd = `cd /root/carelearn-pro && cat ${remoteSql} | docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres psql -U carelearn -d carelearn -v ON_ERROR_STOP=1`;
    const applied = await exec(conn, runCmd);
    if (applied.code !== 0) throw new Error(applied.err || 'Failed to apply SQL');

    const verifyCmd = `cd /root/carelearn-pro && docker compose -f docker-compose.production.yml --env-file .env.production exec -T postgres psql -U carelearn -d carelearn -P pager=off -c "SELECT id,title,slug,status FROM courses ORDER BY title; SELECT c.title, COUNT(l.id) AS lesson_count FROM courses c LEFT JOIN modules m ON m.course_id=c.id LEFT JOIN lessons l ON l.module_id=m.id GROUP BY c.title ORDER BY c.title; SELECT c.title, COUNT(aq.id) AS final_questions FROM courses c LEFT JOIN assessment_questions aq ON aq.course_id=c.id AND aq.is_final_assessment=true AND aq.is_active=true GROUP BY c.title ORDER BY c.title;"`;
    const verified = await exec(conn, verifyCmd);
    if (verified.code !== 0) throw new Error(verified.err || 'Failed verify SQL');

    const report = {
      at: new Date().toISOString(),
      source_root: COURSE_ROOT,
      courses: normalizedCourses.map((c) => ({ key: c.key, id: c.id, lessons: c.lessons.length, questions: c.assessmentQuestions.length })),
      demo_learner: { email: DEMO.email, password: DEMO.password },
      validation_report: validationReportPath,
      asset_sync: assetSync,
      verification: verified.out,
    };
    const reportPath = path.resolve(process.cwd(), 'cleanup-reports', `real-training-integration-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Integration complete.\nValidation: ${validationReportPath}\nReport: ${reportPath}`);
  } finally {
    conn.end();
  }
}

run().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
