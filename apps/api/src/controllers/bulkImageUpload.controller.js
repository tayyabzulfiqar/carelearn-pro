'use strict';

const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const db = require('../config/database');

const IMAGE_ID_RE = /(?:IMG[_-]?|image[_-]?)(\d+)/i;

/**
 * Extract image_id from a filename.
 * Handles: IMG_101.webp, img_101.png, image_101.webp, IMG101.jpg
 */
function extractImageId(filename) {
  const base = path.basename(filename, path.extname(filename));
  // Direct IMG_NNN match
  const directMatch = base.match(/^(IMG_\d+)$/i);
  if (directMatch) return directMatch[1].toUpperCase();
  // Looser match
  const looseMatch = base.match(IMAGE_ID_RE);
  if (looseMatch) return `IMG_${looseMatch[1]}`;
  return null;
}

/**
 * POST /api/v1/admin/cms/import/images/match
 * Multipart: field 'images[]' — multiple files
 */
exports.bulkMatchImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILES', message: 'No files uploaded' } });
    }

    const { courseId } = req.body;
    if (!courseId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_COURSE_ID', message: 'courseId is required' } });
    }

    const orgId = req.tenant?.organisationId || null;
    const userId = req.user?.id || null;
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const resolved = [];
    const orphaned = [];
    let processed = 0;
    let matched = 0;

    for (const file of req.files) {
      processed++;
      const imageId = extractImageId(file.originalname);

      if (!imageId) {
        // Cannot determine image ID — orphan
        orphaned.push({ filename: file.originalname, reason: 'Cannot extract IMG_NNN pattern from filename' });
        if (file.path) try { fs.unlinkSync(file.path); } catch (_) {}
        continue;
      }

      // Check if this image_id has a mapping for this course
      const mappingRes = await db.query(
        `SELECT id, lesson_context, placement FROM image_mappings WHERE course_id = $1 AND image_id = $2`,
        [courseId, imageId]
      );

      if (!mappingRes.rows.length) {
        // No mapping — orphan (save to quarantine, do NOT create media_assets)
        const quarantineDir = path.join(path.dirname(file.path), '../quarantine');
        if (!fs.existsSync(quarantineDir)) fs.mkdirSync(quarantineDir, { recursive: true });
        const quarantinePath = path.join(quarantineDir, `ORPHAN-${imageId}-${Date.now()}${path.extname(file.originalname)}`);
        try { fs.renameSync(file.path, quarantinePath); } catch (_) {}
        orphaned.push({ filename: file.originalname, reason: `No image_mapping record for ${imageId} in course ${courseId}` });
        continue;
      }

      matched++;
      const mapping = mappingRes.rows[0];

      // Build storage URL
      const storageUrl = courseId
        ? `${baseUrl}/uploads/course-${courseId}/images/${file.filename}`
        : `${baseUrl}/uploads/images/${file.filename}`;

      // Insert or update media_assets
      const assetId = randomUUID();
      const assetRes = await db.query(
        `INSERT INTO media_assets
           (id, organisation_id, uploaded_by, file_name, storage_path, mime_type, file_size_bytes, image_id, image_mapping_id, course_namespace)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          assetId,
          orgId,
          userId,
          file.originalname,
          storageUrl,
          file.mimetype,
          file.size,
          imageId,
          mapping.id,
          `course_${courseId.substring(0, 3)}`,
        ]
      );

      const finalAssetId = assetRes.rows[0]?.id || assetId;

      // Update image_mappings to resolved
      await db.query(
        `UPDATE image_mappings
         SET media_asset_id = $1, resolution_status = 'resolved'
         WHERE id = $2`,
        [finalAssetId, mapping.id]
      );

      // Update lesson_blocks_parsed
      await db.query(
        `UPDATE lesson_blocks_parsed
         SET resolution_status = 'resolved'
         WHERE image_mapping_id = $1`,
        [mapping.id]
      );

      resolved.push({
        imageId,
        filename: file.originalname,
        lessonContext: mapping.lesson_context || '',
        storageUrl,
      });
    }

    // Check sequential set completeness
    const setStatusMap = {};
    const setsRes = await db.query(
      `SELECT sequential_set_key, resolution_status
       FROM image_mappings
       WHERE course_id = $1 AND is_sequential_set = true AND sequential_set_key IS NOT NULL`,
      [courseId]
    );

    for (const row of setsRes.rows) {
      const key = row.sequential_set_key;
      if (!setStatusMap[key]) setStatusMap[key] = { total: 0, resolved: 0 };
      setStatusMap[key].total++;
      if (row.resolution_status === 'resolved') setStatusMap[key].resolved++;
    }

    const sequentialSetStatus = {};
    for (const [key, counts] of Object.entries(setStatusMap)) {
      sequentialSetStatus[key] = counts.total === counts.resolved ? 'complete' : 'partial';
    }

    // Return pending assets
    const pendingRes = await db.query(
      `SELECT image_id, filename, lesson_context FROM image_mappings
       WHERE course_id = $1 AND resolution_status != 'resolved'
       ORDER BY image_id`,
      [courseId]
    );

    return res.status(200).json({
      success: true,
      data: {
        processed,
        matched,
        orphaned: orphaned.length,
        resolved,
        orphanedFiles: orphaned,
        sequentialSetStatus,
        pendingAssets: pendingRes.rows.map(r => ({
          imageId: r.image_id,
          filename: r.filename,
          lessonContext: r.lesson_context,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/admin/cms/import/images/status?courseId=UUID
 */
exports.getImageStatus = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (!courseId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_COURSE_ID', message: 'courseId is required' } });
    }

    const slotsRes = await db.query(
      `SELECT
         im.image_id,
         im.filename,
         im.position,
         im.ratio,
         im.frame_style,
         im.resolution_status,
         im.lesson_context,
         im.is_sequential_set,
         im.sequential_set_key,
         ma.storage_path AS cdn_url,
         lbp.lesson_id
       FROM image_mappings im
       LEFT JOIN media_assets ma ON ma.id = im.media_asset_id
       LEFT JOIN lesson_blocks_parsed lbp ON lbp.image_mapping_id = im.id
       WHERE im.course_id = $1
       ORDER BY im.image_id`,
      [courseId]
    );

    const slots = slotsRes.rows;
    const totalSlots = slots.length;
    const resolvedSlots = slots.filter(s => s.resolution_status === 'resolved').length;
    const pendingSlots = slots.filter(s => s.resolution_status === 'asset_pending' || s.resolution_status === 'unresolved').length;
    const errorSlots = slots.filter(s => s.resolution_status === 'unresolved_error').length;

    return res.status(200).json({
      success: true,
      data: {
        courseId,
        totalSlots,
        resolvedSlots,
        pendingSlots,
        errorSlots,
        slots: slots.map(s => ({
          imageId: s.image_id,
          filename: s.filename,
          position: s.position,
          ratio: s.ratio,
          frameStyle: s.frame_style,
          resolutionStatus: s.resolution_status,
          cdnUrl: s.cdn_url || null,
          lessonTitle: s.lesson_context,
          lessonId: s.lesson_id,
          isSequentialSet: s.is_sequential_set,
          sequentialSetKey: s.sequential_set_key,
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
};
