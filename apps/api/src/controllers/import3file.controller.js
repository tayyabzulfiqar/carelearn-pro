'use strict';

const { randomUUID } = require('crypto');
const db = require('../config/database');
const { parseContentPackage } = require('../services/contentParser/index');
const { assembleCourseDom } = require('../services/contentParser/courseAssembler');

const MAX_FILE1_BYTES = 500 * 1024; // 500 KB
const MAX_FILE2_BYTES = 100 * 1024; // 100 KB

/**
 * POST /api/v1/admin/cms/import/parse
 * Body: { courseId, file1Content, file2Content }
 */
exports.parseImport = async (req, res, next) => {
  try {
    const { courseId, file1Content, file2Content } = req.body;

    if (!courseId) return res.status(400).json({ success: false, error: { code: 'MISSING_COURSE_ID', message: 'courseId is required' } });
    if (!file1Content) return res.status(400).json({ success: false, error: { code: 'MISSING_FILE1', message: 'file1Content (Content File) is required' } });
    if (!file2Content) return res.status(400).json({ success: false, error: { code: 'MISSING_FILE2', message: 'file2Content (Mapping File) is required' } });

    if (Buffer.byteLength(file1Content, 'utf8') > MAX_FILE1_BYTES) {
      return res.status(400).json({ success: false, error: { code: 'FILE1_TOO_LARGE', message: 'file1Content exceeds 500 KB limit' } });
    }
    if (Buffer.byteLength(file2Content, 'utf8') > MAX_FILE2_BYTES) {
      return res.status(400).json({ success: false, error: { code: 'FILE2_TOO_LARGE', message: 'file2Content exceeds 100 KB limit' } });
    }

    const orgId = req.tenant?.organisationId || null;
    const userId = req.user?.id || null;

    // Create import_jobs record
    const jobId = randomUUID();
    await db.query(
      `INSERT INTO import_jobs (id, organisation_id, created_by, course_id, status, file1_content, file2_content)
       VALUES ($1, $2, $3, $4, 'parsing', $5, $6)`,
      [jobId, orgId, userId, courseId, file1Content, file2Content]
    );

    // Run the parser
    const parseResult = await parseContentPackage(file1Content, file2Content, courseId, db);

    const stats = parseResult.stats || {};
    const validationResult = parseResult.validationResult || { isValid: false, blockingErrors: [], warnings: [] };
    const resolutionReport = parseResult.resolutionReport || {};

    // Update import_jobs with parse results
    await db.query(
      `UPDATE import_jobs
       SET status = 'validating',
           parse_errors = $1,
           validation_errors = $2,
           block_count = $3,
           image_slot_count = $4,
           module_count = $5,
           lesson_count = $6,
           parse_report = $7,
           updated_at = NOW()
       WHERE id = $8`,
      [
        JSON.stringify(parseResult.errors || []),
        JSON.stringify(validationResult.blockingErrors || []),
        stats.blockCount || 0,
        stats.imageSlotCount || 0,
        stats.moduleCount || 0,
        stats.lessonCount || 0,
        JSON.stringify({
          canPublish: parseResult.canPublish,
          stats,
          validationResult,
          resolutionReport,
          resolvedCourseDom: parseResult.resolvedCourseDom,
        }),
        jobId,
      ]
    );

    // Build module preview (titles + lesson counts)
    const preview = {
      modules: (parseResult.resolvedCourseDom?.modules || []).map(m => ({
        title: m.title,
        lessonCount: m.lessons.length,
        lessons: m.lessons.map(l => ({ title: l.title, blockCount: l.blocks.length })),
      })),
    };

    return res.status(200).json({
      success: true,
      data: {
        importJobId: jobId,
        canPublish: parseResult.canPublish,
        stats: {
          moduleCount: stats.moduleCount || 0,
          lessonCount: stats.lessonCount || 0,
          blockCount: stats.blockCount || 0,
          imageSlotCount: stats.imageSlotCount || 0,
          imageIds: stats.imageIds || [],
        },
        validationErrors: validationResult.blockingErrors || [],
        warnings: validationResult.warnings || [],
        validationSummary: validationResult.summary || '',
        resolutionReport: {
          resolvedCount: resolutionReport.resolvedCount || 0,
          pendingCount: resolutionReport.pendingCount || 0,
          errorCount: resolutionReport.errorCount || 0,
          errors: resolutionReport.errors || [],
          pendingAssets: resolutionReport.pendingAssets || [],
        },
        preview,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/admin/cms/import/assemble
 * Body: { importJobId }
 */
exports.assembleImport = async (req, res, next) => {
  try {
    const { importJobId } = req.body;
    if (!importJobId) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_JOB_ID', message: 'importJobId is required' } });
    }

    const jobRes = await db.query(`SELECT * FROM import_jobs WHERE id = $1`, [importJobId]);
    if (!jobRes.rows.length) {
      return res.status(404).json({ success: false, error: { code: 'JOB_NOT_FOUND', message: 'Import job not found' } });
    }
    const job = jobRes.rows[0];

    if (job.status === 'pending' || job.status === 'parsing') {
      return res.status(400).json({ success: false, error: { code: 'PARSE_NOT_COMPLETE', message: 'Run /import/parse first' } });
    }
    if (job.status === 'complete') {
      return res.status(400).json({ success: false, error: { code: 'ALREADY_ASSEMBLED', message: 'This import job was already assembled' } });
    }
    if (job.status === 'failed') {
      return res.status(400).json({ success: false, error: { code: 'JOB_FAILED', message: 'This import job failed previously. Create a new job.' } });
    }

    const parseReport = job.parse_report || {};
    if (!parseReport.canPublish) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERRORS',
          message: 'Cannot assemble: parse report has blocking validation errors',
          details: parseReport.validationResult?.blockingErrors || [],
        },
      });
    }

    // Mark as assembling
    await db.query(`UPDATE import_jobs SET status = 'assembling', updated_at = NOW() WHERE id = $1`, [importJobId]);

    const orgId = req.tenant?.organisationId || null;
    const userId = req.user?.id || null;
    const courseId = job.course_id;

    // Restore the resolved course DOM from parse report
    const resolvedCourseDom = parseReport.resolvedCourseDom;
    if (!resolvedCourseDom) {
      await db.query(`UPDATE import_jobs SET status = 'failed', updated_at = NOW() WHERE id = $1`, [importJobId]);
      return res.status(500).json({ success: false, error: { code: 'NO_DOM', message: 'No resolved course DOM in parse report. Re-run parse.' } });
    }

    resolvedCourseDom._importJobId = importJobId;

    let assemblyResult;
    try {
      assemblyResult = await assembleCourseDom(resolvedCourseDom, courseId, orgId, userId, db);
    } catch (err) {
      await db.query(
        `UPDATE import_jobs SET status = 'failed', parse_report = parse_report || $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify({ assemblyError: err.message }), importJobId]
      );
      return next(err);
    }

    // Mark complete
    await db.query(
      `UPDATE import_jobs
       SET status = 'complete',
           parse_report = parse_report || $1,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify({ assemblyResult }), importJobId]
    );

    return res.status(200).json({
      success: true,
      data: {
        importJobId,
        courseId,
        modulesCreated: assemblyResult.modulesCreated,
        lessonsCreated: assemblyResult.lessonsCreated,
        blocksCreated: assemblyResult.blocksCreated,
        imageMappingsCreated: assemblyResult.imageMappingsCreated,
        studioUrl: `/admin/trainings/${courseId}/studio`,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/admin/cms/import/jobs?courseId=UUID
 */
exports.listImportJobs = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    let query = `SELECT id, course_id, status, module_count, lesson_count, block_count, image_slot_count, created_at, updated_at FROM import_jobs`;
    const params = [];
    if (courseId) {
      query += ` WHERE course_id = $1`;
      params.push(courseId);
    }
    query += ` ORDER BY created_at DESC LIMIT 50`;

    const result = await db.query(query, params);
    return res.status(200).json({ success: true, data: { jobs: result.rows } });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/admin/cms/import/jobs/:jobId
 */
exports.getImportJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const result = await db.query(`SELECT * FROM import_jobs WHERE id = $1`, [jobId]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Import job not found' } });
    }
    return res.status(200).json({ success: true, data: { job: result.rows[0] } });
  } catch (err) {
    return next(err);
  }
};
