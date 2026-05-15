const { randomUUID, randomBytes } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { toSlug } = require('../lib/slug');
const { setSubscriptionState } = require('../middleware/subscription');
const { ensureInvoiceForMonth, monthStart } = require('./billing');

function buildTempPassword() {
  const raw = randomBytes(12).toString('base64url');
  return `Tmp-${raw.slice(0, 14)}!`;
}

async function uniqueSlug(base) {
  let slug = toSlug(base || 'agency');
  if (!slug) slug = `agency-${Date.now()}`;
  let candidate = slug;
  let i = 1;
  while (true) {
    const exists = await db.query('SELECT 1 FROM organisations WHERE slug = $1 LIMIT 1', [candidate]);
    if (!exists.rows.length) return candidate;
    i += 1;
    candidate = `${slug}-${i}`;
  }
}

async function assignStarterCourses({ organisationId, userId }) {
  const courses = await db.query(
    `SELECT id
     FROM courses
     WHERE status IN ('published', 'draft')
     ORDER BY is_mandatory DESC, created_at ASC
     LIMIT 5`
  );
  const assigned = [];
  for (const course of courses.rows) {
    const enrollment = await db.query(
      `INSERT INTO enrollments (id, user_id, course_id, organisation_id, status)
       VALUES ($1,$2,$3,$4,'enrolled')
       ON CONFLICT (user_id, course_id) DO UPDATE SET organisation_id = EXCLUDED.organisation_id
       RETURNING id, course_id`,
      [randomUUID(), userId, course.id, organisationId]
    );
    assigned.push(enrollment.rows[0]);
  }
  return assigned;
}

async function createAgencyOnboarding({ agencyName, adminFullName, adminEmail, phone = null, notes = null, actorId }) {
  const email = String(adminEmail || '').toLowerCase().trim();
  if (!email) throw new Error('admin_email_required');
  const existing = await db.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [email]);
  if (existing.rows.length) throw new Error('duplicate_admin_email');

  const slug = await uniqueSlug(agencyName);
  const agencyId = randomUUID();
  const organisationId = randomUUID();
  const userId = randomUUID();
  const [firstName, ...rest] = String(adminFullName || '').trim().split(/\s+/);
  const lastName = rest.join(' ') || 'Admin';
  const tempPassword = buildTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  const now = new Date();
  const trialEnds = new Date(now.getTime() + (14 * 24 * 60 * 60 * 1000));

  await db.query('BEGIN');
  try {
    const org = await db.query(
      `INSERT INTO organisations (id, name, slug, subscription_plan, max_seats, is_active)
       VALUES ($1,$2,$3,'starter',50,true)
       RETURNING *`,
      [organisationId, agencyName, slug]
    );
    const agency = await db.query(
      `INSERT INTO agencies (id, name, slug, owner_user_id, status, billing_email, metadata)
       VALUES ($1,$2,$3,$4,'active',$5,$6)
       RETURNING *`,
      [agencyId, agencyName, slug, null, email, { phone, notes, onboarding_mode: 'layer7b_simple' }]
    );
    const user = await db.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
       VALUES ($1,$2,$3,$4,$5,'agency_admin',true)
       RETURNING id, email, first_name, last_name, role`,
      [userId, email, passwordHash, firstName || 'Agency', lastName]
    );
    await db.query(
      `UPDATE agencies
       SET owner_user_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [userId, agencyId]
    );
    await db.query(
      `INSERT INTO organisation_members (id, organisation_id, user_id, role)
       VALUES ($1,$2,$3,'agency_admin')`,
      [randomUUID(), organisationId, userId]
    );
    await db.query(
      `INSERT INTO organisation_settings (id, organisation_id, key, value)
       VALUES
       ($1,$2,'onboarding_profile',$3),
       ($4,$2,'dashboard_state',$5),
       ($6,$2,'billing_profile',$7)
       ON CONFLICT (organisation_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [
        randomUUID(),
        organisationId,
        {
          completed: true,
          created_at: now.toISOString(),
          created_by: actorId || null,
          admin_email: email,
        },
        randomUUID(),
        {
          starter_view_ready: true,
          starter_widgets: ['courses', 'billing', 'compliance'],
          updated_at: now.toISOString(),
        },
        randomUUID(),
        {
          pricing: { base_monthly_price: 30, certificate_price: 5 },
          currency: 'EUR',
          mode: 'demo_internal',
          updated_at: now.toISOString(),
        },
      ]
    );
    await setSubscriptionState({
      organisationId,
      actorId,
      payload: {
        state: 'trial',
        seat_limit: 50,
        trial_seat_limit: 10,
        starts_at: now.toISOString(),
        ends_at: trialEnds.toISOString(),
        trial_days: 14,
        features: { enrollment: true, certificates: true, compliance: true },
      },
    });
    const starterEnrollments = await assignStarterCourses({ organisationId, userId });
    const invoice = await ensureInvoiceForMonth(organisationId, monthStart(now), actorId || null);

    await db.query('COMMIT');
    return {
      agency: agency.rows[0],
      organisation: org.rows[0],
      admin: user.rows[0],
      temporary_password: tempPassword,
      login_url: '/login',
      starter_course_assignments: starterEnrollments.length,
      trial: {
        starts_at: now.toISOString(),
        ends_at: trialEnds.toISOString(),
        trial_days: 14,
      },
      billing_invoice_id: invoice.id,
      onboarding_summary: {
        agency_name: agencyName,
        admin_email: email,
        organisation_slug: slug,
      },
    };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}

module.exports = { createAgencyOnboarding };
