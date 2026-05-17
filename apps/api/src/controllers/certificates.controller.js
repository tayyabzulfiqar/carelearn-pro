const { randomUUID } = require('crypto');
const uuidv4 = randomUUID;
const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/database');
const { CERTIFICATE_ROOT, generateCertificateImage } = require('../lib/certificate-image');
const { buildCertificateTemplateModel } = require('../lib/certificate-template');
const { isGlobalRole } = require('../middleware/tenantAccess');
const { recordCertificateUsage } = require('../services/billing');

async function getUserProfile(userId) {
  const userResult = await db.query(
    'SELECT first_name, last_name, email FROM users WHERE id = $1',
    [userId]
  );
  return userResult.rows[0] || { first_name: '', last_name: '', email: '' };
}

function getUserName(user) {
  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
  return fullName || 'Unknown';
}

async function withTemplate(certificate) {
  if (!certificate) return certificate;
  const user = await getUserProfile(certificate.user_id);
  const courseTitle = certificate.course_title || 'Fire Safety Awareness';
  return {
    ...certificate,
    certificate_url: certificate.pdf_url || null,
    template: buildCertificateTemplateModel({
      recipientName: getUserName(user),
      issuedAt: certificate.issued_at,
    }),
    course_title: courseTitle,
    verification_url: certificate.verification_token
      ? `/api/v1/certificates/verify-token/${certificate.verification_token}`
      : null,
  };
}

exports.getByUser = async (req, res, next) => {
  try {
    const clauses = ['cert.user_id = $1'];
    const params = [req.params.userId];
    if (!isGlobalRole(req.user?.role)) {
      params.push(req.tenant?.organisationId || null);
      clauses.push(`cert.organisation_id = $${params.length}`);
    }
    const result = await db.query(
      `SELECT cert.*, c.title as course_title, c.category, c.cqc_reference
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY cert.issued_at DESC`,
      params
    );
    const certificates = await Promise.all(result.rows.map(withTemplate));
    res.json({ certificates });
  } catch (err) { next(err); }
};

exports.issue = async (req, res, next) => {
  try {
    const { enrollment_id, user_id, course_id, organisation_id } = req.body;
    const scopedOrgId = req.scopedOrganisationId || organisation_id || req.tenant?.organisationId || null;
    if (!scopedOrgId) return res.status(400).json({ error: 'Organisation context required' });
    if (!isGlobalRole(req.user?.role)) {
      const member = await db.query(
        'SELECT 1 FROM organisation_members WHERE organisation_id = $1 AND user_id = $2 LIMIT 1',
        [scopedOrgId, user_id]
      );
      if (!member.rows.length) return res.status(403).json({ error: 'Cross-tenant certificate issuance blocked' });
    }
    const passed = await db.query(
      `SELECT a.id
       FROM assessment_attempts a
       JOIN enrollments e ON e.id = a.enrollment_id
       WHERE a.enrollment_id=$1 AND a.is_final=true AND a.passed=true AND e.organisation_id = $2
       LIMIT 1`,
      [enrollment_id, scopedOrgId]
    );
    if (!passed.rows.length) {
      return res.status(403).json({ error: 'Assessment not passed' });
    }
    const course = await db.query(
      'SELECT renewal_years, title FROM courses WHERE id=$1', [course_id]
    );
    const renewalYears = course.rows[0]?.renewal_years || 1;
    const courseTitle = course.rows[0]?.title || 'Fire Safety Awareness';
    const user = await getUserProfile(user_id);
    let image = { publicUrl: null };
    try {
      image = await generateCertificateImage({
        userId: user_id,
        userName: getUserName(user),
        courseTitle,
        issuedAt: new Date(),
      });
    } catch (imgErr) {
      console.error('Certificate image generation failed:', imgErr.message);
    }

    const existing = await db.query(
      'SELECT * FROM certificates WHERE enrollment_id = $1',
      [enrollment_id]
    );
    if (existing.rows.length) {
      const updated = await db.query(
        'UPDATE certificates SET pdf_url = $1 WHERE id = $2 RETURNING *',
        [image.publicUrl, existing.rows[0].id]
      );
      await recordCertificateUsage(updated.rows[0]);
      return res.status(200).json({
        certificate: await withTemplate({ ...updated.rows[0], course_title: courseTitle }),
        certificate_url: image.publicUrl,
      });
    }

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + renewalYears);
    const certNumber = `CLP-${Date.now()}-${Math.random().toString(36).substr(2,6).toUpperCase()}`;
    const verificationToken = randomUUID().replace(/-/g, '').slice(0, 24);
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO certificates
       (id, enrollment_id, user_id, course_id, organisation_id, certificate_number, verification_token, pdf_url, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, enrollment_id, user_id, course_id, scopedOrgId, certNumber, verificationToken, image.publicUrl, expiresAt]
    );
    await recordCertificateUsage(result.rows[0]);
    await db.query(
      `UPDATE enrollments SET status='completed', completed_at=NOW() WHERE id=$1`,
      [enrollment_id]
    );
    res.status(201).json({
      certificate: await withTemplate({
        ...result.rows[0],
        course_title: courseTitle,
      }),
      certificate_url: image.publicUrl,
    });
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

exports.verifyByToken = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT cert.*, u.first_name, u.last_name, c.title as course_title
       FROM certificates cert
       JOIN users u ON u.id = cert.user_id
       JOIN courses c ON c.id = cert.course_id
       WHERE cert.verification_token = $1`,
      [req.params.token]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Certificate not found' });
    const cert = result.rows[0];
    const isValid = cert.is_valid && new Date(cert.expires_at) > new Date();
    res.json({ certificate: await withTemplate(cert), is_valid: isValid });
  } catch (err) { next(err); }
};

exports.downloadImage = async (req, res, next) => {
  try {
    const fileName = path.basename(req.params.fileName);
    const filePath = path.join(CERTIFICATE_ROOT, fileName);
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }

    const result = await db.query(
      `SELECT cert.*, u.first_name, u.last_name, c.title as course_title
       FROM certificates cert
       JOIN users u ON u.id = cert.user_id
       JOIN courses c ON c.id = cert.course_id
       WHERE cert.pdf_url = $1
       LIMIT 1`,
      [`/certificates/${fileName}`]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Certificate image not found' });

    const cert = result.rows[0];
    const image = await generateCertificateImage({
      userId: cert.user_id,
      userName: getUserName(cert),
      courseTitle: cert.course_title,
      issuedAt: cert.issued_at,
    });
    res.sendFile(image.filePath);
  } catch (err) { next(err); }
};
