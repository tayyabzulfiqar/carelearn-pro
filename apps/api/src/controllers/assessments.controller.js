const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true';
  return false;
}

exports.getQuestions = async (req, res, next) => {
  try {
    const { courseId, lessonNumber: lessonNumberParam } = req.params;
    const { module_id, lesson_number: lessonNumberQuery, is_final } = req.query;
    const lessonNumber = Number(lessonNumberParam || lessonNumberQuery || 0) || null;
    const finalMode = parseBoolean(is_final);

    let query = `SELECT id, course_id, module_id, lesson_number, question_text, question_type,
                        options, correct_answer, explanation, difficulty, is_final_assessment,
                        question_key, option_order, order_index
                 FROM assessment_questions
                 WHERE course_id = $1 AND is_active = true`;
    const params = [courseId];

    if (module_id) {
      params.push(module_id);
      query += ` AND module_id = $${params.length}`;
    }

    params.push(finalMode);
    query += ` AND is_final_assessment = $${params.length}`;

    if (!finalMode && lessonNumber) {
      params.push(lessonNumber);
      query += ` AND lesson_number = $${params.length}`;
    }

    query += ' ORDER BY order_index ASC';

    const result = await db.query(query, params);
    res.json({
      questions: result.rows,
      lesson_number: lessonNumber,
      is_final: finalMode,
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
    const finalMode = !!is_final;
    const normalizedLessonNumber = finalMode ? null : Number(lesson_number || 0) || null;

    let query = `SELECT id, correct_answer
                 FROM assessment_questions
                 WHERE course_id = $1 AND is_active = true`;
    const params = [courseId];

    if (module_id) {
      params.push(module_id);
      query += ` AND module_id = $${params.length}`;
    }

    params.push(finalMode);
    query += ` AND is_final_assessment = $${params.length}`;

    if (!finalMode && normalizedLessonNumber) {
      params.push(normalizedLessonNumber);
      query += ` AND lesson_number = $${params.length}`;
    }

    query += ' ORDER BY order_index ASC';

    const questions = await db.query(query, params);
    const total = questions.rows.length;
    if (total === 0) {
      return res.status(400).json({ error: 'No questions found' });
    }

    const submittedAnswers = Array.isArray(answers) ? answers : [];
    let correct = 0;
    questions.rows.forEach((question) => {
      const userAnswer = submittedAnswers.find((answer) => answer.question_id === question.id);
      if (userAnswer && userAnswer.answer === question.correct_answer) {
        correct += 1;
      }
    });

    const score = Math.round((correct / total) * 100);
    const passMarkRow = await db.query('SELECT pass_mark FROM courses WHERE id = $1', [courseId]);
    const passMark = passMarkRow.rows[0]?.pass_mark || 75;
    const passed = score >= passMark;
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
    });
  } catch (err) { next(err); }
};
