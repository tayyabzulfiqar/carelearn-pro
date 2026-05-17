const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');

exports.getQuestions = async (req, res, next) => {
  try {
    const { courseId, lessonNumber: lessonNumberParam } = req.params;
    const { lesson_number: lessonNumberQuery, is_final } = req.query;
    const isFinal = is_final !== 'false';
    const lessonNumber = Number(lessonNumberParam || lessonNumberQuery || 0) || null;

    // Try quiz_questions first (legacy quiz builder path)
    const quizzesResult = await db.query(
      `SELECT id, pass_mark, retry_limit
       FROM quizzes
       WHERE course_id = $1
         AND status = 'published'
         AND quiz_type = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [courseId, isFinal ? 'final' : 'lesson']
    );

    if (quizzesResult.rows.length) {
      const quiz = quizzesResult.rows[0];
      const questions = await db.query(
        `SELECT id, question_text, options, question_type, explanation, order_index,
                correct_answer, difficulty, question_key, lesson_number
         FROM quiz_questions
         WHERE quiz_id = $1 AND is_active = true
         ORDER BY order_index ASC`,
        [quiz.id]
      );
      return res.json({
        questions: questions.rows,
        lesson_number: lessonNumber,
        is_final: isFinal,
        quiz_id: quiz.id,
        pass_mark: quiz.pass_mark || 75,
        retry_limit: quiz.retry_limit,
      });
    }

    const assessmentClauses = [
      'course_id = $1',
      'is_active = true',
      `is_final_assessment = ${isFinal ? 'true' : 'false'}`,
    ];
    const assessmentParams = [courseId];
    if (!isFinal && lessonNumber) {
      assessmentParams.push(lessonNumber);
      assessmentClauses.push(`lesson_number = $${assessmentParams.length}`);
    }
    const authored = await db.query(
      `SELECT id, question_text, options, question_type, explanation, order_index,
              correct_answer, difficulty, question_key, lesson_number, is_final_assessment
       FROM assessment_questions
       WHERE ${assessmentClauses.join(' AND ')}
       ORDER BY order_index ASC`,
      assessmentParams
    );
    if (authored.rows.length) {
      const courseRow = await db.query('SELECT pass_mark FROM courses WHERE id = $1', [courseId]);
      return res.json({
        questions: authored.rows,
        lesson_number: lessonNumber,
        is_final: isFinal,
        pass_mark: courseRow.rows[0]?.pass_mark || 75,
      });
    }

    // Fall back to questions table (import-fire-safety-course path)
    const clauses = [
      'course_id = $1',
      'is_active = true',
      `is_final_assessment = ${isFinal ? 'true' : 'false'}`,
    ];
    const params = [courseId];

    if (!isFinal && lessonNumber) {
      params.push(lessonNumber);
      clauses.push(`lesson_number = $${params.length}`);
    }

    const result = await db.query(
      `SELECT id, question_text, options, question_type, explanation, order_index,
              correct_answer, difficulty, question_key, lesson_number, is_final_assessment
       FROM questions
       WHERE ${clauses.join(' AND ')}
       ORDER BY order_index ASC`,
      params
    );

    const courseRow = await db.query('SELECT pass_mark FROM courses WHERE id = $1', [courseId]);
    const passMark = courseRow.rows[0]?.pass_mark || 75;

    res.json({
      questions: result.rows,
      lesson_number: lessonNumber,
      is_final: isFinal,
      pass_mark: passMark,
    });
  } catch (err) { next(err); }
};

exports.updateQuestion = async (req, res, next) => {
  try {
    const {
      question_text,
      question_type,
      options,
      correct_answer,
      explanation,
      module_id,
      lesson_number,
      difficulty,
      is_final_assessment,
      order_index,
      is_active,
    } = req.body;
    const result = await db.query(
      `UPDATE assessment_questions
       SET question_text = COALESCE($1, question_text),
           question_type = COALESCE($2, question_type),
           options = COALESCE($3, options),
           correct_answer = COALESCE($4, correct_answer),
           explanation = COALESCE($5, explanation),
           module_id = COALESCE($6, module_id),
           lesson_number = COALESCE($7, lesson_number),
           difficulty = COALESCE($8, difficulty),
           is_final_assessment = COALESCE($9, is_final_assessment),
           order_index = COALESCE($10, order_index),
           is_active = COALESCE($11, is_active)
       WHERE id = $12 AND course_id = $13
       RETURNING *`,
      [
        question_text,
        question_type,
        options ? JSON.stringify(options) : null,
        correct_answer,
        explanation,
        module_id,
        lesson_number || null,
        difficulty,
        is_final_assessment,
        order_index,
        is_active,
        req.params.questionId,
        req.params.courseId,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Question not found' });
    res.json({ question: result.rows[0] });
  } catch (err) { next(err); }
};

exports.deleteQuestion = async (req, res, next) => {
  try {
    const result = await db.query(
      'DELETE FROM assessment_questions WHERE id = $1 AND course_id = $2 RETURNING id',
      [req.params.questionId, req.params.courseId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Question not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
};

exports.addQuestion = async (req, res, next) => {
  try {
    const {
      question_text,
      question_type,
      options,
      correct_answer,
      explanation,
      module_id,
      lesson_number,
      difficulty,
      is_final_assessment,
      order_index,
      question_key,
      version_tag,
    } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO assessment_questions
       (id, course_id, module_id, lesson_number, question_text, question_type, options,
        correct_answer, explanation, difficulty, is_final_assessment, is_active,
        version_tag, question_key, option_order, order_index)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$13,$14,$15)
       RETURNING *`,
      [
        id,
        req.params.courseId,
        module_id,
        lesson_number || null,
        question_text,
        question_type || 'multiple_choice',
        JSON.stringify(options || []),
        correct_answer,
        explanation,
        difficulty || null,
        !!is_final_assessment,
        version_tag || null,
        question_key || null,
        JSON.stringify((options || []).map((_, index) => index)),
        order_index || 0,
      ]
    );
    res.status(201).json({ question: result.rows[0] });
  } catch (err) { next(err); }
};

exports.submitAttempt = async (req, res, next) => {
  try {
    const {
      enrollment_id,
      module_id,
      lesson_number,
      is_final,
      answers,
    } = req.body;
    const { courseId } = req.params;
    const finalMode = is_final !== false;
    const normalizedLessonNumber = finalMode ? null : Number(lesson_number || 0) || null;

    const submittedAnswers = Array.isArray(answers) ? answers : [];
    const quizForCourse = await db.query(
      `SELECT id, pass_mark, retry_limit
       FROM quizzes
       WHERE course_id = $1
         AND status = 'published'
         AND quiz_type = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [courseId, finalMode ? 'final' : 'lesson']
    );

    let correct = 0;
    let total = 0;
    let score = 0;
    let passMark = 75;
    let passed = false;

    const courseRow = await db.query('SELECT pass_mark FROM courses WHERE id = $1', [courseId]);
    passMark = courseRow.rows[0]?.pass_mark || 75;

    if (quizForCourse.rows.length) {
      const quiz = quizForCourse.rows[0];
      passMark = quiz.pass_mark || passMark;
      const attemptsCount = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM assessment_attempts
         WHERE enrollment_id = $1
           AND is_final = $2`,
        [enrollment_id, finalMode]
      );
      if (attemptsCount.rows[0].count >= (quiz.retry_limit || 3)) {
        return res.status(429).json({
          error: 'Retry limit exceeded for this quiz',
          retry_limit: quiz.retry_limit || 3,
        });
      }

      const questions = await db.query(
        `SELECT id, correct_answer, weight
         FROM quiz_questions
         WHERE quiz_id = $1
           AND is_active = true`,
        [quiz.id]
      );
      total = questions.rows.length;
      const byId = new Map(questions.rows.map((q) => [q.id, q]));
      const totalWeight = questions.rows.reduce((sum, q) => sum + Number(q.weight || 1), 0) || 1;
      let earned = 0;
      for (const answer of submittedAnswers) {
        const q = byId.get(answer.question_id);
        if (!q) continue;
        const isCorrect = String(answer.answer).trim() === String(q.correct_answer).trim();
        if (isCorrect) {
          correct += 1;
          earned += Number(q.weight || 1);
        }
      }
      score = Number(((earned / totalWeight) * 100).toFixed(2));
      passed = score >= passMark;
    } else {
      // Fall back to questions table (import path)
      const qClauses = ['course_id = $1', 'is_active = true', `is_final_assessment = ${finalMode ? 'true' : 'false'}`];
      const qParams = [courseId];
      if (!finalMode && normalizedLessonNumber) {
        qParams.push(normalizedLessonNumber);
        qClauses.push(`lesson_number = $${qParams.length}`);
      }
      const questionsResult = await db.query(
        `SELECT id, correct_answer FROM questions WHERE ${qClauses.join(' AND ')}`,
        qParams
      );
      total = questionsResult.rows.length;
      const byId = new Map(questionsResult.rows.map((q) => [q.id, q]));
      for (const answer of submittedAnswers) {
        const q = byId.get(answer.question_id);
        if (!q) continue;
        if (String(answer.answer).trim() === String(q.correct_answer).trim()) correct++;
      }
      score = total > 0 ? Number(((correct / total) * 100).toFixed(2)) : 0;
      passed = score >= passMark;
    }
    const attemptId = uuidv4();

    await db.query(
      `INSERT INTO assessment_attempts
       (id, enrollment_id, user_id, module_id, lesson_number, is_final, score, passed, answers)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        attemptId,
        enrollment_id,
        req.user.id,
        module_id || null,
        normalizedLessonNumber,
        finalMode,
        score,
        passed,
        JSON.stringify(submittedAnswers),
      ]
    );

    res.json({
      score,
      passed,
      correct,
      total,
      pass_mark: passMark,
      message: passed ? 'PASS' : 'You must achieve at least 75% to pass.',
      lesson_number: normalizedLessonNumber,
      is_final: finalMode,
      certificate_url: null,
    });
  } catch (err) { next(err); }
};
