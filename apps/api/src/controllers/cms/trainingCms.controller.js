const { randomUUID } = require('crypto');
const db = require('../../config/database');
const { toSlug } = require('../../lib/slug');
const { normalizeLessonDocument, validateLessonDocument } = require('../../lib/rich-content');
const { getProvider } = require('../../services/storage');
const { parsePagination } = require('../../utils/pagination');

async function replaceCourseLinks({ courseId, categories = [], tags = [] }) {
  await db.query('DELETE FROM training_course_categories WHERE course_id = $1', [courseId]);
  await db.query('DELETE FROM training_course_tags WHERE course_id = $1', [courseId]);

  for (const category of categories) {
    const slug = toSlug(category);
    const categoryResult = await db.query(
      `INSERT INTO training_categories (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [category, slug]
    );
    await db.query(
      'INSERT INTO training_course_categories (id, course_id, category_id) VALUES ($1, $2, $3) ON CONFLICT (course_id, category_id) DO NOTHING',
      [randomUUID(), courseId, categoryResult.rows[0].id]
    );
  }

  for (const tag of tags) {
    const slug = toSlug(tag);
    const tagResult = await db.query(
      `INSERT INTO training_tags (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tag, slug]
    );
    await db.query(
      'INSERT INTO training_course_tags (id, course_id, tag_id) VALUES ($1, $2, $3) ON CONFLICT (course_id, tag_id) DO NOTHING',
      [randomUUID(), courseId, tagResult.rows[0].id]
    );
  }
}

exports.listTrainings = async (req, res, next) => {
  try {
    const {
      q,
      status,
      category,
      sort = 'updated_desc',
    } = req.query;
    const { limit, offset } = parsePagination(req.query, { limit: 50, offset: 0, maxLimit: 200 });

    const params = [];
    const where = ['1=1'];

    if (q) {
      params.push(`%${q}%`);
      where.push(`(c.title ILIKE $${params.length} OR c.description ILIKE $${params.length} OR c.slug ILIKE $${params.length})`);
    }

    if (status) {
      params.push(status);
      where.push(`c.status = $${params.length}`);
    }

    if (category) {
      params.push(category);
      where.push(`tc.slug = $${params.length}`);
    }

    const sortMap = {
      updated_desc: 'c.updated_at DESC',
      updated_asc: 'c.updated_at ASC',
      title_asc: 'c.title ASC',
      title_desc: 'c.title DESC',
      created_desc: 'c.created_at DESC',
    };

    params.push(Number(limit));
    const limitPos = params.length;
    params.push(Number(offset));
    const offsetPos = params.length;

    const result = await db.query(
      `SELECT c.*,
              COALESCE(json_agg(DISTINCT tc.name) FILTER (WHERE tc.id IS NOT NULL), '[]') AS categories,
              COALESCE(json_agg(DISTINCT tt.name) FILTER (WHERE tt.id IS NOT NULL), '[]') AS tags
       FROM courses c
       LEFT JOIN training_course_categories tcc ON tcc.course_id = c.id
       LEFT JOIN training_categories tc ON tc.id = tcc.category_id
       LEFT JOIN training_course_tags tct ON tct.course_id = c.id
       LEFT JOIN training_tags tt ON tt.id = tct.tag_id
       WHERE ${where.join(' AND ')}
       GROUP BY c.id
       ORDER BY ${sortMap[sort] || sortMap.updated_desc}
       LIMIT $${limitPos} OFFSET $${offsetPos}`,
      params
    );

    return res.success({ trainings: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.createTraining = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      tags = [],
      thumbnail_url,
      duration_minutes = 30,
      renewal_years = 1,
      pass_mark = 75,
      status = 'draft',
      is_mandatory = false,
      cqc_reference = null,
      skills_for_care_ref = null,
      target_roles = [],
    } = req.body;

    const courseId = randomUUID();
    const slug = toSlug(title);

    const created = await db.query(
      `INSERT INTO courses (
         id, title, slug, description, category, cqc_reference, skills_for_care_ref,
         target_roles, duration_minutes, renewal_years, pass_mark, is_mandatory,
         thumbnail_url, status, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
       ) RETURNING *`,
      [
        courseId,
        title,
        slug,
        description || null,
        category || 'general',
        cqc_reference,
        skills_for_care_ref,
        target_roles,
        duration_minutes,
        renewal_years,
        pass_mark,
        is_mandatory,
        thumbnail_url || null,
        status,
        req.user.id,
      ]
    );

    await replaceCourseLinks({
      courseId,
      categories: category ? [category] : [],
      tags,
    });

    return res.success({ training: created.rows[0] }, {}, 201);
  } catch (err) {
    return next(err);
  }
};

exports.updateTraining = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      tags = [],
      thumbnail_url,
      duration_minutes,
      renewal_years,
      pass_mark,
      status,
      is_mandatory,
      cqc_reference,
      skills_for_care_ref,
      target_roles,
    } = req.body;

    const updated = await db.query(
      `UPDATE courses SET
         title = COALESCE($1, title),
         slug = COALESCE($2, slug),
         description = COALESCE($3, description),
         category = COALESCE($4, category),
         thumbnail_url = COALESCE($5, thumbnail_url),
         duration_minutes = COALESCE($6, duration_minutes),
         renewal_years = COALESCE($7, renewal_years),
         pass_mark = COALESCE($8, pass_mark),
         status = COALESCE($9, status),
         is_mandatory = COALESCE($10, is_mandatory),
         cqc_reference = COALESCE($11, cqc_reference),
         skills_for_care_ref = COALESCE($12, skills_for_care_ref),
         target_roles = COALESCE($13, target_roles),
         updated_at = NOW()
       WHERE id = $14
       RETURNING *`,
      [
        title,
        title ? toSlug(title) : null,
        description,
        category,
        thumbnail_url,
        duration_minutes,
        renewal_years,
        pass_mark,
        status,
        is_mandatory,
        cqc_reference,
        skills_for_care_ref,
        target_roles,
        id,
      ]
    );

    if (!updated.rows.length) {
      return res.fail('Training not found', 'NOT_FOUND', 404);
    }

    await replaceCourseLinks({
      courseId: id,
      categories: category ? [category] : [],
      tags,
    });

    return res.success({ training: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.deleteTraining = async (req, res, next) => {
  try {
    await db.query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    return res.success({ deleted: true });
  } catch (err) {
    return next(err);
  }
};

exports.transitionTrainingStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['draft', 'published', 'archived'].includes(status)) {
      return res.fail('Invalid status', 'INVALID_STATUS', 422);
    }

    const updated = await db.query(
      'UPDATE courses SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (!updated.rows.length) return res.fail('Training not found', 'NOT_FOUND', 404);
    return res.success({ training: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.listModules = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT *
       FROM modules
       WHERE course_id = $1
       ORDER BY order_index ASC, created_at ASC`,
      [req.params.courseId]
    );
    return res.success({ modules: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.createModule = async (req, res, next) => {
  try {
    const { title, description, order_index = 0, parent_module_id = null, status = 'draft' } = req.body;
    const moduleId = randomUUID();
    const created = await db.query(
      `INSERT INTO modules (id, course_id, parent_module_id, title, description, order_index, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [moduleId, req.params.courseId, parent_module_id, title, description || null, order_index, status]
    );
    return res.success({ module: created.rows[0] }, {}, 201);
  } catch (err) {
    return next(err);
  }
};

exports.updateModule = async (req, res, next) => {
  try {
    const { moduleId } = req.params;
    const { title, description, parent_module_id, order_index, status } = req.body;
    const updated = await db.query(
      `UPDATE modules SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         parent_module_id = COALESCE($3, parent_module_id),
         order_index = COALESCE($4, order_index),
         status = COALESCE($5, status)
       WHERE id = $6
       RETURNING *`,
      [title, description, parent_module_id, order_index, status, moduleId]
    );

    if (!updated.rows.length) return res.fail('Module not found', 'NOT_FOUND', 404);
    return res.success({ module: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.reorderModules = async (req, res, next) => {
  try {
    const { orderedModuleIds = [] } = req.body;
    await db.query('BEGIN');
    for (let i = 0; i < orderedModuleIds.length; i += 1) {
      await db.query('UPDATE modules SET order_index = $1 WHERE id = $2', [i, orderedModuleIds[i]]);
    }
    await db.query('COMMIT');
    return res.success({ reordered: true });
  } catch (err) {
    await db.query('ROLLBACK');
    return next(err);
  }
};

exports.saveModuleTree = async (req, res, next) => {
  try {
    const { modules = [] } = req.body;
    const courseId = req.params.courseId;
    const { expectedVersion } = req.body;
    if (!Array.isArray(modules) || !modules.length) {
      return res.fail('No modules supplied', 'INVALID_INPUT', 422);
    }

    const versionKey = `builder_version_${courseId}`;
    const versionRow = await db.query(
      `SELECT value FROM organisation_settings
       WHERE organisation_id = $1 AND key = $2
       LIMIT 1`,
      [req.tenant.organisationId, versionKey]
    );
    const currentVersion = Number(versionRow.rows[0]?.value?.version || 0);
    if (expectedVersion !== undefined && Number(expectedVersion) !== currentVersion) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'BUILDER_VERSION_CONFLICT',
          message: 'Builder has changed in another session. Refresh to reconcile.',
          details: { currentVersion },
        },
      });
    }

    await db.query('BEGIN');
    for (const moduleNode of modules) {
      await db.query(
        `UPDATE modules
         SET parent_module_id = $1, order_index = $2
         WHERE id = $3 AND course_id = $4`,
        [moduleNode.parent_module_id || null, Number(moduleNode.order_index || 0), moduleNode.id, courseId]
      );
    }

    const historyKey = `builder_history_${courseId}`;
    const previousHistory = await db.query(
      `SELECT value FROM organisation_settings
       WHERE organisation_id = $1 AND key = $2
       LIMIT 1`,
      [req.tenant.organisationId, historyKey]
    );
    const entries = previousHistory.rows[0]?.value?.entries || [];
    const nextEntries = [
      {
        id: randomUUID(),
        saved_at: new Date().toISOString(),
        user_id: req.user.id,
        modules,
      },
      ...entries,
    ].slice(0, 20);

    await db.query(
      `INSERT INTO organisation_settings (id, organisation_id, key, value)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organisation_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [randomUUID(), req.tenant.organisationId, historyKey, { entries: nextEntries }]
    );
    await db.query(
      `INSERT INTO organisation_settings (id, organisation_id, key, value)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organisation_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [randomUUID(), req.tenant.organisationId, versionKey, { version: currentVersion + 1 }]
    );

    await db.query('COMMIT');
    return res.success({ saved: true, entries: nextEntries.length, version: currentVersion + 1 });
  } catch (err) {
    await db.query('ROLLBACK');
    return next(err);
  }
};

exports.getBuilderHistory = async (req, res, next) => {
  try {
    const courseId = req.params.courseId;
    const historyKey = `builder_history_${courseId}`;
    const result = await db.query(
      `SELECT value
       FROM organisation_settings
       WHERE organisation_id = $1 AND key = $2
       LIMIT 1`,
      [req.tenant.organisationId, historyKey]
    );
    const versionKey = `builder_version_${courseId}`;
    const versionRow = await db.query(
      `SELECT value
       FROM organisation_settings
       WHERE organisation_id = $1 AND key = $2
       LIMIT 1`,
      [req.tenant.organisationId, versionKey]
    );
    return res.success({
      entries: result.rows[0]?.value?.entries || [],
      version: Number(versionRow.rows[0]?.value?.version || 0),
    });
  } catch (err) {
    return next(err);
  }
};

exports.deleteModule = async (req, res, next) => {
  try {
    await db.query('DELETE FROM modules WHERE id = $1', [req.params.moduleId]);
    return res.success({ deleted: true });
  } catch (err) {
    return next(err);
  }
};

exports.listLessons = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM lessons
       WHERE module_id = $1
       ORDER BY order_index ASC, created_at ASC`,
      [req.params.moduleId]
    );
    return res.success({
      lessons: result.rows.map((lesson) => ({
        ...lesson,
        content: normalizeLessonDocument({
          title: lesson.title,
          content: lesson.content || {},
        }),
      })),
    });
  } catch (err) {
    return next(err);
  }
};

exports.createLesson = async (req, res, next) => {
  try {
    const {
      title,
      content = {},
      order_index = 0,
      duration_minutes = 5,
      status = 'draft',
      is_visible = true,
      metadata = {},
    } = req.body;
    const validation = validateLessonDocument({ title, content });
    if (!validation.passed) {
      return res.fail('Lesson content is invalid', 'INVALID_LESSON_CONTENT', 422, validation.checks);
    }

    const lessonId = randomUUID();
    const created = await db.query(
      `INSERT INTO lessons (
        id, module_id, title, content, order_index, duration_minutes, status, is_visible, metadata
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        lessonId,
        req.params.moduleId,
        title,
        validation.normalized,
        order_index,
        duration_minutes,
        status,
        is_visible,
        metadata,
      ]
    );

    return res.success({ lesson: created.rows[0] }, {}, 201);
  } catch (err) {
    return next(err);
  }
};

exports.updateLesson = async (req, res, next) => {
  try {
    const { lessonId } = req.params;
    const {
      title,
      content,
      order_index,
      duration_minutes,
      status,
      is_visible,
      metadata,
    } = req.body;
    const contentValidation = content !== undefined
      ? validateLessonDocument({ title: title || '', content })
      : null;
    if (contentValidation && !contentValidation.passed) {
      return res.fail('Lesson content is invalid', 'INVALID_LESSON_CONTENT', 422, contentValidation.checks);
    }

    const updated = await db.query(
      `UPDATE lessons SET
         title = COALESCE($1, title),
         content = COALESCE($2, content),
         order_index = COALESCE($3, order_index),
         duration_minutes = COALESCE($4, duration_minutes),
         status = COALESCE($5, status),
         is_visible = COALESCE($6, is_visible),
         metadata = COALESCE($7, metadata),
         published_at = CASE WHEN COALESCE($5, status) = 'published' THEN NOW() ELSE published_at END
       WHERE id = $8
       RETURNING *`,
      [
        title,
        contentValidation ? contentValidation.normalized : content,
        order_index,
        duration_minutes,
        status,
        is_visible,
        metadata,
        lessonId,
      ]
    );

    if (!updated.rows.length) return res.fail('Lesson not found', 'NOT_FOUND', 404);
    return res.success({ lesson: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.reorderLessons = async (req, res, next) => {
  try {
    const { orderedLessonIds = [] } = req.body;
    await db.query('BEGIN');
    for (let i = 0; i < orderedLessonIds.length; i += 1) {
      await db.query('UPDATE lessons SET order_index = $1 WHERE id = $2', [i, orderedLessonIds[i]]);
    }
    await db.query('COMMIT');
    return res.success({ reordered: true });
  } catch (err) {
    await db.query('ROLLBACK');
    return next(err);
  }
};

exports.deleteLesson = async (req, res, next) => {
  try {
    await db.query('DELETE FROM lessons WHERE id = $1', [req.params.lessonId]);
    return res.success({ deleted: true });
  } catch (err) {
    return next(err);
  }
};

exports.listQuizzes = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT q.*,
              COUNT(qq.id)::int AS question_count
       FROM quizzes q
       LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
       WHERE q.course_id = $1
       GROUP BY q.id
       ORDER BY q.updated_at DESC`,
      [req.params.courseId]
    );
    return res.success({ quizzes: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.createQuiz = async (req, res, next) => {
  try {
    const {
      title,
      module_id,
      quiz_type = 'final',
      pass_mark = 75,
      retry_limit = 3,
      time_limit_seconds,
      status = 'draft',
    } = req.body;

    const quizId = randomUUID();
    const created = await db.query(
      `INSERT INTO quizzes (
        id, course_id, module_id, title, quiz_type, pass_mark, retry_limit, time_limit_seconds, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [quizId, req.params.courseId, module_id || null, title, quiz_type, pass_mark, retry_limit, time_limit_seconds || null, status]
    );

    return res.success({ quiz: created.rows[0] }, {}, 201);
  } catch (err) {
    return next(err);
  }
};

exports.updateQuiz = async (req, res, next) => {
  try {
    const { quizId } = req.params;
    const { title, module_id, quiz_type, pass_mark, retry_limit, time_limit_seconds, status } = req.body;

    const updated = await db.query(
      `UPDATE quizzes SET
         title = COALESCE($1, title),
         module_id = COALESCE($2, module_id),
         quiz_type = COALESCE($3, quiz_type),
         pass_mark = COALESCE($4, pass_mark),
         retry_limit = COALESCE($5, retry_limit),
         time_limit_seconds = COALESCE($6, time_limit_seconds),
         status = COALESCE($7, status),
         published_at = CASE WHEN COALESCE($7, status) = 'published' THEN NOW() ELSE published_at END,
         updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [title, module_id, quiz_type, pass_mark, retry_limit, time_limit_seconds, status, quizId]
    );

    if (!updated.rows.length) return res.fail('Quiz not found', 'NOT_FOUND', 404);
    return res.success({ quiz: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.deleteQuiz = async (req, res, next) => {
  try {
    await db.query('DELETE FROM quizzes WHERE id = $1', [req.params.quizId]);
    return res.success({ deleted: true });
  } catch (err) {
    return next(err);
  }
};

exports.listQuizQuestions = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT * FROM quiz_questions
       WHERE quiz_id = $1
       ORDER BY order_index ASC`,
      [req.params.quizId]
    );
    return res.success({ questions: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.createQuizQuestion = async (req, res, next) => {
  try {
    const {
      question_text,
      question_type = 'single_choice',
      options = [],
      correct_answer,
      explanation,
      weight = 1,
      order_index = 0,
    } = req.body;

    const id = randomUUID();
    const created = await db.query(
      `INSERT INTO quiz_questions (
         id, quiz_id, question_text, question_type, options, correct_answer,
         explanation, weight, order_index
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [id, req.params.quizId, question_text, question_type, options, correct_answer, explanation || null, weight, order_index]
    );

    return res.success({ question: created.rows[0] }, {}, 201);
  } catch (err) {
    return next(err);
  }
};

exports.updateQuizQuestion = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const { question_text, question_type, options, correct_answer, explanation, weight, order_index, is_active } = req.body;

    const updated = await db.query(
      `UPDATE quiz_questions SET
         question_text = COALESCE($1, question_text),
         question_type = COALESCE($2, question_type),
         options = COALESCE($3, options),
         correct_answer = COALESCE($4, correct_answer),
         explanation = COALESCE($5, explanation),
         weight = COALESCE($6, weight),
         order_index = COALESCE($7, order_index),
         is_active = COALESCE($8, is_active)
       WHERE id = $9
       RETURNING *`,
      [question_text, question_type, options, correct_answer, explanation, weight, order_index, is_active, questionId]
    );

    if (!updated.rows.length) return res.fail('Question not found', 'NOT_FOUND', 404);
    return res.success({ question: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.deleteQuizQuestion = async (req, res, next) => {
  try {
    await db.query('DELETE FROM quiz_questions WHERE id = $1', [req.params.questionId]);
    return res.success({ deleted: true });
  } catch (err) {
    return next(err);
  }
};

exports.getQuizAnalytics = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT q.id, q.title,
              COUNT(a.id)::int AS attempts,
              COUNT(a.id) FILTER (WHERE a.passed = true)::int AS passed_attempts,
              AVG(a.score)::numeric(10,2) AS avg_score
       FROM quizzes q
       LEFT JOIN assessment_attempts a
              ON a.module_id = q.module_id
       WHERE q.course_id = $1
       GROUP BY q.id, q.title
       ORDER BY q.title ASC`,
      [req.params.courseId]
    );

    return res.success({ analytics: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.listCertificateTemplates = async (req, res, next) => {
  try {
    const organisationId = req.tenant?.organisationId || null;
    const result = await db.query(
      `SELECT * FROM certificate_templates
       WHERE organisation_id IS NULL OR organisation_id = $1
       ORDER BY is_default DESC, created_at DESC`,
      [organisationId]
    );
    return res.success({ templates: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.createCertificateTemplate = async (req, res, next) => {
  try {
    const { name, template_type = 'completion', template_data = {}, is_default = false, status = 'active' } = req.body;
    const id = randomUUID();
    const organisationId = req.tenant?.organisationId || null;

    if (is_default && organisationId) {
      await db.query('UPDATE certificate_templates SET is_default = false WHERE organisation_id = $1', [organisationId]);
    }

    const created = await db.query(
      `INSERT INTO certificate_templates (id, organisation_id, name, template_type, template_data, is_default, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [id, organisationId, name, template_type, template_data, is_default, status]
    );

    return res.success({ template: created.rows[0] }, {}, 201);
  } catch (err) {
    return next(err);
  }
};

exports.updateCertificateTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { name, template_type, template_data, is_default, status } = req.body;

    const updated = await db.query(
      `UPDATE certificate_templates SET
         name = COALESCE($1, name),
         template_type = COALESCE($2, template_type),
         template_data = COALESCE($3, template_data),
         is_default = COALESCE($4, is_default),
         status = COALESCE($5, status),
         updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [name, template_type, template_data, is_default, status, templateId]
    );

    if (!updated.rows.length) return res.fail('Template not found', 'NOT_FOUND', 404);
    return res.success({ template: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.deleteCertificateTemplate = async (req, res, next) => {
  try {
    await db.query('DELETE FROM certificate_templates WHERE id = $1', [req.params.templateId]);
    return res.success({ deleted: true });
  } catch (err) {
    return next(err);
  }
};

exports.renewCertificate = async (req, res, next) => {
  try {
    const { certificateId } = req.params;
    const { renewal_years = 1 } = req.body;

    const updated = await db.query(
      `UPDATE certificates
       SET expires_at = COALESCE(expires_at, NOW()) + ($1::text || ' years')::interval,
           is_valid = true
       WHERE id = $2
       RETURNING *`,
      [renewal_years, certificateId]
    );

    if (!updated.rows.length) return res.fail('Certificate not found', 'NOT_FOUND', 404);
    return res.success({ certificate: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.listMediaAssets = async (req, res, next) => {
  try {
    const organisationId = req.tenant?.organisationId || null;
    const result = await db.query(
      `SELECT * FROM media_assets
       WHERE organisation_id IS NULL OR organisation_id = $1
       ORDER BY created_at DESC`,
      [organisationId]
    );
    return res.success({ assets: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.registerMediaAsset = async (req, res, next) => {
  try {
    const {
      file_name,
      storage_path,
      mime_type,
      file_size_bytes = 0,
      tags = [],
      visibility = 'private',
      metadata = {},
    } = req.body;
    const id = randomUUID();
    const organisationId = req.tenant?.organisationId || null;

    const created = await db.query(
      `INSERT INTO media_assets (
         id, organisation_id, uploaded_by, file_name, storage_path, mime_type,
         file_size_bytes, tags, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        id,
        organisationId,
        req.user.id,
        file_name,
        storage_path,
        mime_type || null,
        file_size_bytes,
        tags,
        { ...metadata, visibility },
      ]
    );

    return res.success({ asset: created.rows[0] }, {}, 201);
  } catch (err) {
    return next(err);
  }
};

exports.deleteMediaAsset = async (req, res, next) => {
  try {
    await db.query('DELETE FROM media_assets WHERE id = $1', [req.params.assetId]);
    return res.success({ deleted: true });
  } catch (err) {
    return next(err);
  }
};

exports.uploadMediaAsset = async (req, res, next) => {
  try {
    if (!req.file) return res.fail('No file uploaded', 'NO_FILE', 400);
    const provider = getProvider();
    const saved = await provider.save(req.file.buffer, req.file.originalname, req.file.mimetype);

    const id = randomUUID();
    const organisationId = req.tenant?.organisationId || null;
    const created = await db.query(
      `INSERT INTO media_assets (
         id, organisation_id, uploaded_by, file_name, storage_path, mime_type,
         file_size_bytes, tags, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        id,
        organisationId,
        req.user.id,
        saved.fileName,
        saved.publicPath,
        saved.mimeType,
        req.file.size,
        [],
        { original_name: req.file.originalname, visibility: req.body.visibility || 'private' },
      ]
    );

    return res.success({ asset: created.rows[0] }, {}, 201);
  } catch (err) {
    return next(err);
  }
};

exports.listOrganisationMembers = async (req, res, next) => {
  try {
    const orgId = req.tenant.organisationId;
    const result = await db.query(
      `SELECT om.id, om.role, om.joined_at, u.id AS user_id, u.email, u.first_name, u.last_name
       FROM organisation_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organisation_id = $1
       ORDER BY om.joined_at DESC`,
      [orgId]
    );
    return res.success({ members: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.createInvitation = async (req, res, next) => {
  try {
    const orgId = req.tenant.organisationId;
    const { email, role = 'learner', expires_in_days = 7 } = req.body;
    const token = randomUUID().replace(/-/g, '');
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + Number(expires_in_days) * 24 * 3600 * 1000);

    const created = await db.query(
      `INSERT INTO invitations (id, organisation_id, email, role, invited_by, token, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [id, orgId, email, role, req.user.id, token, expiresAt]
    );
    return res.success({ invitation: created.rows[0], invite_link: `/invite/${token}` }, {}, 201);
  } catch (err) {
    return next(err);
  }
};

exports.listInvitations = async (req, res, next) => {
  try {
    const orgId = req.tenant.organisationId;
    const result = await db.query(
      `SELECT * FROM invitations
       WHERE organisation_id = $1
       ORDER BY created_at DESC`,
      [orgId]
    );
    return res.success({ invitations: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.revokeInvitation = async (req, res, next) => {
  try {
    const updated = await db.query(
      `UPDATE invitations
       SET status = 'revoked'
       WHERE id = $1
         AND organisation_id = $2
       RETURNING *`,
      [req.params.invitationId, req.tenant.organisationId]
    );
    if (!updated.rows.length) return res.fail('Invitation not found', 'NOT_FOUND', 404);
    return res.success({ invitation: updated.rows[0] });
  } catch (err) {
    return next(err);
  }
};

exports.reissueInvitation = async (req, res, next) => {
  try {
    const id = req.params.invitationId;
    const token = randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const updated = await db.query(
      `UPDATE invitations
       SET status = 'pending',
           token = $1,
           expires_at = $2,
           accepted_at = NULL
       WHERE id = $3
         AND organisation_id = $4
       RETURNING *`,
      [token, expiresAt, id, req.tenant.organisationId]
    );
    if (!updated.rows.length) return res.fail('Invitation not found', 'NOT_FOUND', 404);
    return res.success({ invitation: updated.rows[0], invite_link: `/invite/${token}` });
  } catch (err) {
    return next(err);
  }
};

exports.acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.params;
    const invite = await db.query(
      `SELECT * FROM invitations
       WHERE token = $1
         AND status = 'pending'
         AND expires_at > NOW()
       LIMIT 1`,
      [token]
    );
    if (!invite.rows.length) return res.fail('Invitation is invalid or expired', 'INVITE_INVALID', 404);

    const row = invite.rows[0];
    await db.query(
      `INSERT INTO organisation_members (id, organisation_id, user_id, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organisation_id, user_id) DO NOTHING`,
      [randomUUID(), row.organisation_id, req.user.id, row.role]
    );
    await db.query(
      `UPDATE invitations
       SET status = 'accepted', accepted_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    return res.success({ accepted: true, organisation_id: row.organisation_id });
  } catch (err) {
    return next(err);
  }
};

exports.listOrganisationSettings = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT key, value
       FROM organisation_settings
       WHERE organisation_id = $1`,
      [req.tenant.organisationId]
    );
    return res.success({ settings: result.rows });
  } catch (err) {
    return next(err);
  }
};

exports.upsertOrganisationSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const result = await db.query(
      `INSERT INTO organisation_settings (id, organisation_id, key, value)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organisation_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING *`,
      [randomUUID(), req.tenant.organisationId, key, value]
    );
    return res.success({ setting: result.rows[0] });
  } catch (err) {
    return next(err);
  }
};
