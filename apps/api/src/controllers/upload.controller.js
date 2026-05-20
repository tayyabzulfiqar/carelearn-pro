const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../config/database');
const { normalizeLessonDocument } = require('../lib/rich-content');

const IMAGE_NAME_PATTERN = /^slide(\d+)_(\d+)\.(jpg|jpeg|png|webp|gif)$/i;

function inferPdfFilename(file = {}) {
  return file.originalName || file.filename || 'Document.pdf';
}

function isPdfAsset(file = {}) {
  return String(file.mimeType || '').toLowerCase().includes('pdf');
}

async function upsertPdfBlockForLesson({ lessonId, uploadedPdf }) {
  const lessonResult = await db.query(
    `SELECT id, title, content
     FROM lessons
     WHERE id = $1
     LIMIT 1`,
    [lessonId]
  );
  if (!lessonResult.rows.length) return { updated: false, reason: 'lesson_not_found' };

  const lesson = lessonResult.rows[0];
  const normalized = normalizeLessonDocument({
    title: lesson.title,
    content: lesson.content || {},
  });
  const blocks = Array.isArray(normalized.blocks) ? [...normalized.blocks] : [];
  const payload = {
    url: uploadedPdf.url,
    filename: inferPdfFilename(uploadedPdf),
    mimeType: 'application/pdf',
  };

  const matchIndex = blocks.findIndex((block) => (
    block?.type === 'pdf_document' && (
      block?.payload?.url === payload.url
      || String(block?.payload?.filename || '').toLowerCase() === payload.filename.toLowerCase()
    )
  ));

  if (matchIndex >= 0) {
    blocks[matchIndex] = {
      ...blocks[matchIndex],
      payload: { ...(blocks[matchIndex].payload || {}), ...payload },
    };
  } else {
    blocks.push({
      id: randomUUID(),
      type: 'pdf_document',
      order: blocks.length,
      payload,
    });
  }

  const nextContent = normalizeLessonDocument({
    title: lesson.title,
    content: {
      ...normalized,
      blocks,
    },
  });

  await db.query(
    `UPDATE lessons
     SET content = $1
     WHERE id = $2`,
    [nextContent, lessonId]
  );
  return { updated: true };
}

exports.uploadImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const courseId = req.body.courseId || req.params.courseId;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const warnings = [];

    const uploaded = req.files.flatMap((file) => {
      const filename = path.basename(file.originalname);
      if (!IMAGE_NAME_PATTERN.test(filename)) {
        warnings.push(`Ignored image "${filename}" because it does not match slide{number}_{index}.jpg`);
        return [];
      }
      const targetPath = path.join(path.dirname(file.path), filename);
      if (file.filename !== filename && !fs.existsSync(targetPath)) {
        fs.renameSync(file.path, targetPath);
      }
      const servedName = fs.existsSync(targetPath) ? filename : file.filename;
      return [{
        originalName: file.originalname,
        filename: servedName,
        url: courseId
          ? `${baseUrl}/uploads/course-${courseId}/images/${servedName}`
          : `${baseUrl}/uploads/images/${servedName}`,
        size: file.size,
      }];
    });

    return res.success({ images: uploaded, count: uploaded.length, warnings });
  } catch (err) {
    return next(err);
  }
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

    const organisationId = req.tenant?.organisationId || null;
    const lessonId = req.body?.lesson_id || req.query?.lesson_id || null;
    const insertedAssets = [];

    for (const file of uploaded) {
      const created = await db.query(
        `INSERT INTO media_assets (
           id, organisation_id, uploaded_by, file_name, storage_path, mime_type,
           file_size_bytes, tags, metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          randomUUID(),
          organisationId,
          req.user.id,
          file.filename,
          file.url,
          file.mimeType,
          file.size,
          [],
          { original_name: file.originalName, source: 'upload.media' },
        ]
      );
      insertedAssets.push(created.rows[0]);
    }

    let lessonPdfSync = null;
    if (lessonId) {
      const pdfs = uploaded.filter(isPdfAsset);
      if (pdfs.length) {
        let updatedCount = 0;
        for (const pdf of pdfs) {
          const result = await upsertPdfBlockForLesson({ lessonId, uploadedPdf: pdf });
          if (result.updated) updatedCount += 1;
        }
        lessonPdfSync = {
          lesson_id: lessonId,
          attempted: pdfs.length,
          updated: updatedCount,
        };
      }
    }

    return res.success({
      files: uploaded,
      assets: insertedAssets,
      count: uploaded.length,
      lesson_pdf_sync: lessonPdfSync,
    });
  } catch (err) {
    return next(err);
  }
};
