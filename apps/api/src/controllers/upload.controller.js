const fs = require('fs');
const path = require('path');
const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');
const { normalizeLessonContent, validateStructuredLessonContent } = require('../lib/lesson-content');

const IMAGE_NAME_PATTERN = /^slide(\d+)_(\d+)\.(jpg|jpeg|png|webp|gif)$/i;

const buildMarkerBlocks = ({ body, imageLookup, warnings, lessonTitle }) => {
  const IMAGE_MARKER_PATTERN = /\[IMG:(\d+)_(\d+)\]/gi;
  const blocks = [];
  let hasInvalidMarker = false;
  let lastIndex = 0;
  let match;
  while ((match = IMAGE_MARKER_PATTERN.exec(body || '')) !== null) {
    const textBefore = (body || '').slice(lastIndex, match.index).trim();
    if (textBefore) {
      blocks.push({ type: 'text', value: textBefore });
    }
    const markerPrefix = `slide${match[1]}_${match[2]}`;
    const markerImageName = Object.keys(imageLookup).find(fileName => fileName.startsWith(`${markerPrefix}.`));
    const markerImageUrl = markerImageName ? imageLookup[markerImageName] : null;
    if (markerImageUrl) {
      blocks.push({ type: 'image', value: markerImageUrl, image: markerImageName });
    } else {
      warnings.push(`Missing image for marker [IMG:${match[1]}_${match[2]}] in lesson "${lessonTitle || 'Untitled lesson'}"`);
      hasInvalidMarker = true;
    }
    lastIndex = match.index + match[0].length;
  }
  const trailingText = (body || '').slice(lastIndex).trim();
  if (trailingText) {
    blocks.push({ type: 'text', value: trailingText });
  }
  return { blocks, hasMarkers: lastIndex > 0, hasInvalidMarker };
};

const buildContentBlocks = ({ body, images, keyPoints, microCheck, imageLookup, warnings, lessonTitle }) => {
  const markerBlocks = buildMarkerBlocks({ body, imageLookup, warnings, lessonTitle });
  const blocks = markerBlocks.hasMarkers ? [...markerBlocks.blocks] : [];
  if (!markerBlocks.hasMarkers && body) {
    blocks.push({ type: 'text', value: body });
  }
  if (!markerBlocks.hasMarkers && images.length > 1) {
    blocks.push({ type: 'image_grid', value: images });
  } else if (!markerBlocks.hasMarkers && images.length === 1) {
    const imageFileName = path.basename(images[0]);
    blocks.push({ type: 'image', value: images[0], image: imageFileName });
  }
  if (keyPoints.length > 0) {
    blocks.push({ type: 'key_points', value: keyPoints });
  }
  if (microCheck && microCheck.question && Array.isArray(microCheck.options)) {
    blocks.push({
      type: 'micro_check',
      question: microCheck.question,
      options: microCheck.options,
      answer: microCheck.answer,
    });
  }
  return { blocks, hasInvalidMarker: markerBlocks.hasInvalidMarker };
};

const validateLesson = (lesson, normalizedContent, hasInvalidMarker) => {
  const warnings = [];
  if (!lesson.title) warnings.push('Missing lesson title');
  if (lesson.micro_check) {
    const hasValidOptions = Array.isArray(lesson.micro_check.options);
    const hasValidAnswer = Number.isInteger(lesson.micro_check.answer)
      && hasValidOptions
      && lesson.micro_check.answer >= 0
      && lesson.micro_check.answer < lesson.micro_check.options.length;
    if (!lesson.micro_check.question || !hasValidOptions || !hasValidAnswer) {
      warnings.push('Invalid micro_check configuration');
    }
  }
  if (hasInvalidMarker) {
    warnings.push('Lesson contains invalid or missing image markers');
  }
  const validation = validateStructuredLessonContent({
    title: lesson.title,
    content: normalizedContent,
  });
  if (!validation.passed) {
    warnings.push('Structured lesson validation failed');
  }
  return {
    isValid: warnings.length === 0,
    warnings,
  };
};

exports.uploadImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: 'No images uploaded' });
    const courseId = req.body.courseId || req.params.courseId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const warnings = [];
    const filesToProcess = req.files.slice(0, 100);
    if (req.files.length > 100) {
      warnings.push('Image upload limit reached. Only the first 100 images were processed.');
    }
    const uploaded = filesToProcess.flatMap(file => {
      const filename = path.basename(file.originalname);
      if (!IMAGE_NAME_PATTERN.test(filename)) {
        warnings.push(`Ignored image "${filename}" because it does not match slide{number}_{index}.jpg`);
        return [];
      }
      const targetPath = path.join(path.dirname(file.path), filename);
      if (file.filename !== filename && !fs.existsSync(targetPath)) {
        fs.renameSync(file.path, targetPath);
      }
      return [{
        originalName: file.originalname,
        filename: fs.existsSync(targetPath) ? filename : file.filename,
        url: courseId
          ? `${baseUrl}/uploads/course-${courseId}/images/${fs.existsSync(targetPath) ? filename : file.filename}`
          : `${baseUrl}/uploads/images/${fs.existsSync(targetPath) ? filename : file.filename}`,
        size: file.size,
      }];
    });
    res.json({ images: uploaded, count: uploaded.length, warnings });
  } catch (err) { next(err); }
};

exports.uploadMedia = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const uploaded = req.files.map((file) => ({
      originalName: file.originalname,
      filename: file.filename,
      url: `${baseUrl}/uploads/media/${file.filename}`,
      size: file.size,
      mimeType: file.mimetype,
    }));
    return res.json({ files: uploaded, count: uploaded.length });
  } catch (err) { return next(err); }
};

exports.bulkUploadContent = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No JSON file uploaded' });

    const course = await db.query('SELECT id FROM courses WHERE id=$1', [courseId]);
    if (!course.rows.length) return res.status(404).json({ error: 'Course not found' });

    const rawData = fs.readFileSync(req.file.path, 'utf8');
    let data;
    try { data = JSON.parse(rawData); }
    catch (e) { return res.status(400).json({ error: 'Invalid JSON format' }); }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageDir = courseId
      ? path.join(__dirname, `../../uploads/course-${courseId}/images`)
      : path.join(__dirname, '../../uploads/images');
    const imageFiles = fs.existsSync(imageDir) ? fs.readdirSync(imageDir) : [];
    const warnings = [];
    const limitedImageFiles = imageFiles.slice(0, 100);
    if (imageFiles.length > 100) {
      warnings.push('Image mapping limit reached. Only the first 100 uploaded images were used.');
    }
    const imagesBySlide = limitedImageFiles.reduce((acc, filename) => {
      const match = path.basename(filename).match(IMAGE_NAME_PATTERN);
      if (!match) {
        warnings.push(`Ignored image "${filename}" because it does not match slide{number}_{index}.jpg`);
        return acc;
      }
      const slideNumber = Number(match[1]);
      const imageOrder = Number(match[2]);
      if (!acc[slideNumber]) acc[slideNumber] = [];
      acc[slideNumber].push({ filename, imageOrder });
      acc[slideNumber].sort((a, b) => a.imageOrder - b.imageOrder);
      return acc;
    }, {});
    const imageLookup = limitedImageFiles.reduce((acc, filename) => {
      if (IMAGE_NAME_PATTERN.test(path.basename(filename))) {
        acc[filename] = courseId
          ? `${baseUrl}/uploads/course-${courseId}/images/${filename}`
          : `${baseUrl}/uploads/images/${filename}`;
      }
      return acc;
    }, {});

    await db.query('BEGIN');

    try {
      await db.query('DELETE FROM assessment_questions WHERE course_id=$1', [courseId]);
      await db.query('DELETE FROM modules WHERE course_id=$1', [courseId]);

      const created = { modules: 0, lessons: 0 };
      let skippedLessons = 0;
      let slideNumber = 1;
      let processedLessons = 0;

      for (let mi = 0; mi < data.modules.length; mi++) {
        const mod = data.modules[mi];
        const moduleId = uuidv4();
        await db.query(
          `INSERT INTO modules (id, course_id, title, description, order_index)
           VALUES ($1,$2,$3,$4,$5)`,
          [moduleId, courseId, mod.title, mod.description || '', mi]
        );
        created.modules++;

        for (let li = 0; li < (mod.lessons || []).length; li++) {
          if (processedLessons >= 50) {
            skippedLessons++;
            warnings.push(`Lesson upload limit reached. Remaining lessons after slide ${slideNumber - 1} were skipped.`);
            slideNumber++;
            continue;
          }
          const lesson = mod.lessons[li];
          const mappedImages = (imagesBySlide[slideNumber] || [])
            .map(image => {
              const imageUrl = imageLookup[image.filename];
              if (!imageUrl) {
                warnings.push(`Missing image "${image.filename}" for slide ${slideNumber}`);
                return null;
              }
              return imageUrl;
            })
            .filter(Boolean);
          const explicitImages = Array.isArray(lesson.images)
            ? lesson.images.map(image => {
              if (image.startsWith('http')) return image;
              const normalizedName = path.basename(image);
              if (!IMAGE_NAME_PATTERN.test(normalizedName)) {
                warnings.push(`Ignored image reference "${image}" in lesson "${lesson.title || `Slide ${slideNumber}`}"`);
                return null;
              }
              const imageUrl = imageLookup[normalizedName];
              if (!imageUrl) {
                warnings.push(`Missing image "${normalizedName}" in lesson "${lesson.title || `Slide ${slideNumber}`}"`);
                return null;
              }
              return imageUrl;
            }).filter(Boolean)
            : [];
          const singleImageUrl = lesson.image
            ? (() => {
                if (lesson.image.startsWith('http')) return lesson.image;
                const normalizedName = path.basename(lesson.image);
                if (!IMAGE_NAME_PATTERN.test(normalizedName)) {
                  warnings.push(`Ignored image reference "${lesson.image}" in lesson "${lesson.title || `Slide ${slideNumber}`}"`);
                  return null;
                }
                const imageUrl = imageLookup[normalizedName];
                if (!imageUrl) {
                  warnings.push(`Missing image "${normalizedName}" in lesson "${lesson.title || `Slide ${slideNumber}`}"`);
                  return null;
                }
                return imageUrl;
              })()
            : null;
          const contentImages = explicitImages.length > 0
            ? explicitImages
            : (mappedImages.length > 0 ? mappedImages : (singleImageUrl ? [singleImageUrl] : []));
          const imageUrl = singleImageUrl || contentImages[0] || null;
          const microCheck = lesson.micro_check || null;
          const blockResult = buildContentBlocks({
            body: lesson.body || '',
            images: contentImages,
            keyPoints: lesson.key_points || [],
            microCheck,
            imageLookup,
            warnings,
            lessonTitle: lesson.title,
          });
          const normalizedContent = normalizeLessonContent({
            title: lesson.title,
            content: {
              body: lesson.body || '',
              images: contentImages,
              image_url: imageUrl,
              image_alt: lesson.image_alt || lesson.title,
              regulatory_reference: lesson.regulatory_reference || '',
              duration_seconds: lesson.duration_seconds || 60,
              micro_check: microCheck,
              blocks: Array.isArray(blockResult.blocks) ? blockResult.blocks : [],
            },
          });
          const validation = validateLesson(lesson, normalizedContent, blockResult.hasInvalidMarker);
          if (!validation.isValid) {
            skippedLessons++;
            warnings.push(`Skipped lesson "${lesson?.title || `Slide ${slideNumber}`}" on slide ${slideNumber}: ${validation.warnings.join(', ')}`);
            slideNumber++;
            continue;
          }
          const lessonId = uuidv4();
          await db.query(
            `INSERT INTO lessons (id, module_id, title, content, order_index, duration_minutes)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [lessonId, moduleId, lesson.title, JSON.stringify(normalizedContent),
             li, Math.ceil((lesson.duration_seconds || 60) / 60)]
          );
          created.lessons++;
          processedLessons++;
          slideNumber++;
        }
      }

      if (data.questions && data.questions.length > 0) {
        for (let qi = 0; qi < data.questions.length; qi++) {
          const q = data.questions[qi];
          await db.query(
            `INSERT INTO assessment_questions
             (id, course_id, question_text, question_type, options,
              correct_answer, explanation, is_final_assessment, order_index)
             VALUES ($1,$2,$3,'multiple_choice',$4,$5,$6,true,$7)`,
            [uuidv4(), courseId, q.question,
             JSON.stringify(q.options), q.correct_answer,
             q.explanation || '', qi]
          );
        }
      }

      await db.query('COMMIT');
      try { fs.unlinkSync(req.file.path); } catch(e) {}

      res.json({
        message: 'Content uploaded successfully',
        created,
        questions_added: data.questions?.length || 0,
        warnings,
        skipped_lessons: skippedLessons
      });
    } catch (err) {
      await db.query('ROLLBACK');
      throw err;
    }
  } catch (err) { next(err); }
};
