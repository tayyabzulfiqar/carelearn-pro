const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');
const { getStaticQuizQuestions, scoreStaticQuiz } = require('../lib/quiz-data');

exports.getQuestions = async (req, res, next) => {
  try {
    const { courseId, lessonNumber: lessonNumberParam } = req.params;
    const { lesson_number: lessonNumberQuery, is_final } = req.query;
    const lessonNumber = Number(lessonNumberParam || lessonNumberQuery || 0) || null;
    const quizzesResult = await db.query(
      `SELECT id, pass_mark, retry_limit
       FROM quizzes
       WHERE course_id = $1
         AND status = 'published'
         AND quiz_type = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [courseId, is_final === 'false' ? 'lesson' : 'final']
    );

    if (quizzesResult.rows.length) {
      const quiz = quizzesResult.rows[0];
      const questions = await db.query(
        `SELECT id, question_text AS question, options, question_type, explanation, order_index
         FROM quiz_questions
         WHERE quiz_id = $1 AND is_active = true
         ORDER BY order_index ASC`,
        [quiz.id]
      );
      return res.json({
        questions: questions.rows,
        lesson_number: lessonNumber,
        is_final: is_final !== 'false',
        quiz_id: quiz.id,
        pass_mark: quiz.pass_mark,
        retry_limit: quiz.retry_limit,
      });
    }

    res.json({
      questions: getStaticQuizQuestions(courseId),
      lesson_number: lessonNumber,
      is_final: is_final !== 'false',
    });
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

    if (quizForCourse.rows.length) {
      const quiz = quizForCourse.rows[0];
      passMark = quiz.pass_mark || 75;
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
      const scored = scoreStaticQuiz(submittedAnswers, courseId);
      correct = scored.correct;
      total = scored.total;
      score = scored.score;
      passed = scored.passed;
      passMark = 75;
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
