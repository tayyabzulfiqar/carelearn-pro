const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');

exports.getByCourse = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT m.*, json_agg(
         json_build_object('id',l.id,'title',l.title,'order_index',
         l.order_index,'duration_minutes',l.duration_minutes)
         ORDER BY l.order_index
       ) FILTER (WHERE l.id IS NOT NULL) as lessons
       FROM modules m LEFT JOIN lessons l ON l.module_id = m.id
       WHERE m.course_id = $1 GROUP BY m.id ORDER BY m.order_index`,
      [req.params.courseId]
    );
    res.json({ modules: result.rows });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { title, description, order_index } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO modules (id, course_id, title, description, order_index)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, req.params.courseId, title, description, order_index || 0]
    );
    res.status(201).json({ module: result.rows[0] });
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const { title, description, order_index } = req.body;
    const result = await db.query(
      `UPDATE modules SET title=$1, description=$2, order_index=$3
       WHERE id=$4 RETURNING *`,
      [title, description, order_index, req.params.moduleId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Module not found' });
    res.json({ module: result.rows[0] });
  } catch (err) { next(err); }
};

exports.delete = async (req, res, next) => {
  try {
    await db.query('DELETE FROM modules WHERE id=$1', [req.params.moduleId]);
    res.json({ message: 'Module deleted' });
  } catch (err) { next(err); }
};
