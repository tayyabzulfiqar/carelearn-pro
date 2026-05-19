'use strict';

/**
 * structuredLessonGuard — upload route middleware
 *
 * Checks if the target lesson (via lesson_id in body/query) is a
 * structured import lesson. If yes: blocks the upload with 403.
 * If no lesson_id is provided: passes through (course-level uploads allowed).
 *
 * Usage:
 *   router.post('/media', authenticate, structuredLessonGuard, uploadHandler)
 */
const db = require('../config/database');

module.exports = async function structuredLessonGuard(req, res, next) {
  const lessonId = req.params?.lessonId
    || req.body?.lesson_id
    || req.query?.lesson_id
    || req.body?.lessonId
    || req.query?.lessonId;

  if (!lessonId) {
    return next();
  }

  try {
    const result = await db.query(
      'SELECT is_structured_import FROM lessons WHERE id = $1',
      [lessonId]
    );

    if (result.rows.length === 0) {
      return next();
    }

    if (result.rows[0].is_structured_import === true) {
      return res.status(403).json({
        error: {
          code: 'STRUCTURED_LESSON_LOCKED',
          message: 'This lesson was created by the 3-File Import system. Use the Bulk Image Upload workflow to add images. Manual file uploads are disabled for structured lessons.',
          hint: 'Upload images via: POST /admin/cms/import/images/match',
        },
      });
    }

    return next();
  } catch (err) {
    // Fail open on DB error — do not block legacy lessons due to infra issues
    console.error('[structuredLessonGuard] DB error, failing open:', err.message);
    return next();
  }
};
