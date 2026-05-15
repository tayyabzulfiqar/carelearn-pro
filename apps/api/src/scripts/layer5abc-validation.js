#!/usr/bin/env node
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const API_BASE = process.env.LAYER5_API_BASE || 'http://127.0.0.1:5000/api/v1';
const ROOT_EMAIL = process.env.PLATFORM_OWNER_EMAIL || process.env.SUPER_ADMIN_EMAIL;
const ROOT_PASSWORD = process.env.PLATFORM_OWNER_PASSWORD || process.env.SUPER_ADMIN_PASSWORD;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function reqJson(method, path, token, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (_err) {}
  return { status: res.status, data };
}

async function ensureUser({ email, role, password, first = 'Test', last = 'User' }) {
  const hash = await bcrypt.hash(password, 10);
  const id = randomUUID();
  await db.query(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,true)
     ON CONFLICT (email)
     DO UPDATE SET role = EXCLUDED.role, password_hash = EXCLUDED.password_hash, is_active = true`,
    [id, email, hash, first, last, role]
  );
  const row = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  return row.rows[0].id;
}

async function login(email, password) {
  const result = await reqJson('POST', '/auth/login', null, { email, password });
  assertOk(result.status === 200 && result.data?.token, `login failed for ${email}`);
  return result.data.token;
}

async function main() {
  assertOk(ROOT_EMAIL && ROOT_PASSWORD, 'Missing root credentials');
  const rootToken = await login(ROOT_EMAIL, ROOT_PASSWORD);

  const stamp = Date.now();
  const agency1Slug = `agency-a-${stamp}`;
  const agency2Slug = `agency-b-${stamp}`;

  const agencyA = await reqJson('POST', '/admin/platform/agencies', rootToken, {
    name: `Agency A ${stamp}`,
    slug: agency1Slug,
    billing_email: `billing-a-${stamp}@example.com`,
    organisation_name: `Org A ${stamp}`,
  });
  assertOk(agencyA.status === 201, `agencyA create failed ${agencyA.status}`);
  const orgAId = agencyA.data?.data?.organisation?.id;
  assertOk(orgAId, 'orgA missing');

  const agencyB = await reqJson('POST', '/admin/platform/agencies', rootToken, {
    name: `Agency B ${stamp}`,
    slug: agency2Slug,
    billing_email: `billing-b-${stamp}@example.com`,
    organisation_name: `Org B ${stamp}`,
  });
  assertOk(agencyB.status === 201, `agencyB create failed ${agencyB.status}`);
  const orgBId = agencyB.data?.data?.organisation?.id;
  assertOk(orgBId, 'orgB missing');

  const adminAPass = `AgencyA-${stamp}!`;
  const adminAEmail = `agency.admin.${stamp}@example.com`;
  const learnerAEmail = `learner.${stamp}@example.com`;
  const adminAId = await ensureUser({ email: adminAEmail, password: adminAPass, role: 'agency_admin', first: 'Agency', last: 'Admin' });
  const learnerAId = await ensureUser({ email: learnerAEmail, password: 'Learner123!', role: 'learner', first: 'Agency', last: 'Learner' });

  await reqJson('POST', `/organisations/${orgAId}/members`, rootToken, {
    email: adminAEmail,
    first_name: 'Agency',
    last_name: 'Admin',
    role: 'agency_admin',
  });
  await reqJson('POST', `/organisations/${orgAId}/members`, rootToken, {
    email: learnerAEmail,
    first_name: 'Agency',
    last_name: 'Learner',
    role: 'learner',
  });

  const adminAToken = await login(adminAEmail, adminAPass);

  const crossTenantRead = await reqJson('GET', `/organisations/${orgBId}/members`, adminAToken);
  assertOk(crossTenantRead.status === 403, `cross tenant members should fail 403 got ${crossTenantRead.status}`);

  const reportsA = await reqJson('GET', `/organisations/${orgAId}/reports`, adminAToken);
  assertOk(reportsA.status === 200, 'agency report access failed');

  const course = await db.query(`SELECT id FROM courses WHERE status = 'published' ORDER BY created_at DESC LIMIT 1`);
  assertOk(course.rows.length > 0, 'no published course found for enrollment test');
  const courseId = course.rows[0].id;

  const setExpired = await reqJson('POST', `/admin/platform/organisations/${orgAId}/subscription`, rootToken, {
    state: 'expired',
    seat_limit: 50,
    trial_seat_limit: 10,
    features: { enrollment: true, certificates: true, compliance: true },
  });
  assertOk(setExpired.status === 200, 'set expired subscription failed');

  const blockedEnrollment = await reqJson('POST', `/organisations/${orgAId}/enrollments`, adminAToken, {
    user_id: learnerAId,
    course_id: courseId,
  });
  assertOk(blockedEnrollment.status === 403, `expired subscription should block enrollment; got ${blockedEnrollment.status}`);

  const setActive = await reqJson('POST', `/admin/platform/organisations/${orgAId}/subscription`, rootToken, {
    state: 'active',
    seat_limit: 50,
    trial_seat_limit: 10,
    features: { enrollment: true, certificates: true, compliance: true },
  });
  assertOk(setActive.status === 200, 'set active subscription failed');

  const allowedEnrollment = await reqJson('POST', `/organisations/${orgAId}/enrollments`, adminAToken, {
    user_id: learnerAId,
    course_id: courseId,
  });
  assertOk(allowedEnrollment.status === 201, `active subscription enrollment failed ${allowedEnrollment.status}`);

  const audit = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action IN ('platform_agency_create','platform_subscription_update')`
  );
  assertOk(Number(audit.rows[0]?.count || 0) > 0, 'expected platform audit logs missing');

  console.log('layer5abc_validation: ok');
}

main().catch((error) => {
  console.error(`layer5abc_validation_fail ${error.message}`);
  process.exit(1);
});

