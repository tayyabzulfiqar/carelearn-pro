const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');
const { getStaticQuizQuestions, scoreStaticQuiz } = require('../lib/quiz-data');

exports.getQuestions = async (req, res, next) => {
  try {
    const { courseId, lessonNumber: lessonNumberParam } = req.params;
    const { lesson_number: lessonNumberQuery, is_final } = req.query;
    const lessonNumber = Number(lessonNumberParam || lessonNumberQuery || 0) || null;
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
    const { correct, total, score, passed } = scoreStaticQuiz(submittedAnswers, courseId);
    const passMark = 75;
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
