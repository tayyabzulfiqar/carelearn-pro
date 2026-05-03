const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/database');
const { buildCertificateTemplateModel } = require('../lib/certificate-template');

const CERTIFICATE_IMAGE_ROOT = 'C:/Users/HP/Desktop/uk training';

async function getUserProfile(userId) {
  const userResult = await db.query(
    'SELECT first_name, last_name FROM users WHERE id = $1',
    [userId]
  );
  return userResult.rows[0] || { first_name: '', last_name: '' };
}

async function withTemplate(certificate) {
  if (!certificate) return certificate;
  const user = await getUserProfile(certificate.user_id);
  return {
    ...certificate,
    template: buildCertificateTemplateModel({
      imageRoot: CERTIFICATE_IMAGE_ROOT,
      user,
      issuedAt: certificate.issued_at,
    }),
  };
}

exports.getByUser = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT cert.*, c.title as course_title, c.category, c.cqc_reference
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       WHERE cert.user_id = $1
       ORDER BY cert.issued_at DESC`,
      [req.params.userId]
    );
    const certificates = await Promise.all(result.rows.map(withTemplate));
    res.json({ certificates });
  } catch (err) { next(err); }
};

exports.issue = async (req, res, next) => {
  try {
    const { enrollment_id, user_id, course_id, organisation_id } = req.body;
    const questionCount = await db.query(
      'SELECT COUNT(*)::int as count FROM assessment_questions WHERE course_id=$1 AND is_final_assessment=true AND is_active=true',
      [course_id]
    );
    if (questionCount.rows[0].count > 0) {
      const passed = await db.query(
        'SELECT id FROM assessment_attempts WHERE enrollment_id=$1 AND is_final=true AND passed=true LIMIT 1',
        [enrollment_id]
      );
      if (!passed.rows.length) {
        return res.status(403).json({ error: 'Assessment not passed' });
      }
    }
    const existing = await db.query(
      'SELECT * FROM certificates WHERE enrollment_id = $1',
      [enrollment_id]
    );
    if (existing.rows.length) {
      return res.status(200).json({ certificate: await withTemplate(existing.rows[0]) });
    }
    const course = await db.query(
      'SELECT renewal_years FROM courses WHERE id=$1', [course_id]
    );
    const renewalYears = course.rows[0]?.renewal_years || 1;
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + renewalYears);
    const certNumber = `CLP-${Date.now()}-${Math.random().toString(36).substr(2,6).toUpperCase()}`;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO certificates
       (id, enrollment_id, user_id, course_id, organisation_id, certificate_number, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, enrollment_id, user_id, course_id, organisation_id, certNumber, expiresAt]
    );
    await db.query(
      `UPDATE enrollments SET status='completed', completed_at=NOW() WHERE id=$1`,
      [enrollment_id]
    );
    res.status(201).json({ certificate: await withTemplate(result.rows[0]) });
  } catch (err) { next(err); }
};

exports.verify = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT cert.*, u.first_name, u.last_name, c.title as course_title
       FROM certificates cert
       JOIN users u ON u.id = cert.user_id
       JOIN courses c ON c.id = cert.course_id
       WHERE cert.certificate_number = $1`,
      [req.params.certNumber]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Certificate not found' });
    const cert = result.rows[0];
    const isValid = cert.is_valid && new Date(cert.expires_at) > new Date();
    res.json({ certificate: await withTemplate(cert), is_valid: isValid });
  } catch (err) { next(err); }
};
