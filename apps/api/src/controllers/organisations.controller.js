const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');

exports.create = async (req, res, next) => {
  try {
    const { name, slug } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO organisations (id, name, slug) VALUES ($1, $2, $3)
       RETURNING id, name, slug, created_at`,
      [id, name, slug]
    );
    res.status(201).json({ organisation: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, name, slug, logo_url, created_at FROM organisations WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Organisation not found' });
    res.json({ organisation: result.rows[0] });
  } catch (err) { next(err); }
};

exports.getMembers = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, om.joined_at
       FROM organisation_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organisation_id = $1
       ORDER BY om.joined_at DESC`,
      [req.params.id]
    );
    res.json({ members: result.rows });
  } catch (err) { next(err); }
};
