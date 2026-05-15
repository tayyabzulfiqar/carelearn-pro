const { randomUUID, createHash } = require('crypto');
const db = require('../config/database');
const { enqueueJob } = require('./queue');

const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'local_log';

const templates = {
  welcome_email: ({ first_name }) => ({ subject: 'Welcome to CareLearn', text: `Welcome ${first_name || 'Learner'} to CareLearn.` }),
  password_reset: ({ reset_link }) => ({ subject: 'Password Reset', text: `Reset your password: ${reset_link || ''}` }),
  compliance_reminder: ({ message }) => ({ subject: 'Compliance Reminder', text: message || 'Compliance action required.' }),
  certificate_expiry_alert: ({ message }) => ({ subject: 'Certificate Expiry Alert', text: message || 'Your certificate is expiring.' }),
  overdue_training_alert: ({ message }) => ({ subject: 'Overdue Training Alert', text: message || 'Training overdue.' }),
  subscription_alert: ({ message }) => ({ subject: 'Subscription Alert', text: message || 'Subscription action required.' }),
};

function buildTemplate(templateKey, payload) {
  const render = templates[templateKey];
  if (!render) throw new Error(`Unknown email template ${templateKey}`);
  return render(payload || {});
}

function computeDedupKey(organisationId, recipientEmail, templateKey, payload) {
  return createHash('sha256')
    .update(`${organisationId || 'global'}|${recipientEmail}|${templateKey}|${JSON.stringify(payload || {})}`)
    .digest('hex');
}

async function queueEmail({ organisationId, userId = null, recipientEmail, templateKey, payload = {}, cooldownHours = 24 }) {
  const template = buildTemplate(templateKey, payload);
  const dedupKey = computeDedupKey(organisationId, recipientEmail, templateKey, payload);
  const existing = await db.query(
    `SELECT id, status, created_at
     FROM email_deliveries
     WHERE organisation_id IS NOT DISTINCT FROM $1
       AND dedup_key = $2
       AND created_at > NOW() - ($3 || ' hours')::interval
     LIMIT 1`,
    [organisationId, dedupKey, String(cooldownHours)]
  );
  if (existing.rows.length) {
    return { queued: false, reason: 'cooldown_active', id: existing.rows[0].id };
  }
  const insert = await db.query(
    `INSERT INTO email_deliveries
     (id, organisation_id, user_id, recipient_email, template_key, provider, dedup_key, payload, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')
     RETURNING id`,
    [randomUUID(), organisationId, userId, recipientEmail, templateKey, EMAIL_PROVIDER, dedupKey, { ...payload, template }]
  );
  await enqueueJob({
    organisationId,
    queueName: 'email_delivery',
    jobType: 'email.send',
    dedupKey: `email:${insert.rows[0].id}`,
    payload: { email_delivery_id: insert.rows[0].id },
    maxAttempts: 4,
  });
  return { queued: true, id: insert.rows[0].id };
}

async function sendQueuedEmail(emailDeliveryId) {
  const row = await db.query('SELECT * FROM email_deliveries WHERE id = $1 LIMIT 1', [emailDeliveryId]);
  if (!row.rows.length) throw new Error('Email delivery not found');
  const email = row.rows[0];
  if (email.status === 'sent' || email.status === 'suppressed') return { skipped: true };
  try {
    const nextAttempts = Number(email.attempts || 0) + 1;
    await db.query(
      `UPDATE email_deliveries
       SET status='sent', attempts=$2, sent_at=NOW(), updated_at=NOW()
       WHERE id=$1`,
      [email.id, nextAttempts]
    );
    return { sent: true, provider: EMAIL_PROVIDER };
  } catch (err) {
    await db.query(
      `UPDATE email_deliveries
       SET status='failed', attempts=attempts+1, last_error=$2, updated_at=NOW()
       WHERE id=$1`,
      [email.id, err.message]
    );
    throw err;
  }
}

module.exports = {
  queueEmail,
  sendQueuedEmail,
};
