const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../config/database');

const IMAGE_NAME_PATTERN = /^slide(\d+)_(\d+)\.(jpg|jpeg|png|webp|gif)$/i;

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

    return res.success({ files: uploaded, assets: insertedAssets, count: uploaded.length });
  } catch (err) {
    return next(err);
  }
};
