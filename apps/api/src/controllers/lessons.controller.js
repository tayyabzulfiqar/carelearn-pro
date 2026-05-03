const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');
const { normalizeLessonContent } = require('../lib/lesson-content');

exports.getByModule = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM lessons WHERE module_id=$1 ORDER BY order_index',
      [req.params.moduleId]
    );
    res.json({
      lessons: result.rows.map((lesson) => ({
        ...lesson,
        content: normalizeLessonContent({
          title: lesson.title,
          content: lesson.content || {},
        }),
      })),
    });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { title, content, order_index, duration_minutes } = req.body;
    const normalizedContent = normalizeLessonContent({
      title,
      content: content || {},
    });
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO lessons (id, module_id, title, content, order_index, duration_minutes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [id, req.params.moduleId, title, normalizedContent, order_index || 0, duration_minutes || 5]
    );
    res.status(201).json({ lesson: result.rows[0] });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const { title, content, order_index, duration_minutes } = req.body;
    const normalizedContent = normalizeLessonContent({
      title,
      content: content || {},
    });
    const result = await db.query(
      `UPDATE lessons SET title=$1, content=$2, order_index=$3,
       duration_minutes=$4 WHERE id=$5 RETURNING *`,
      [title, normalizedContent, order_index, duration_minutes, req.params.lessonId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Lesson not found' });
    res.json({ lesson: result.rows[0] });
  } catch (err) { next(err); }
};

exports.delete = async (req, res, next) => {
  try {
    await db.query('DELETE FROM lessons WHERE id=$1', [req.params.lessonId]);
    res.json({ message: 'Lesson deleted' });
  } catch (err) { next(err); }
};
