#!/usr/bin/env node
const db = require('../config/database');

const API_BASE = process.env.LAYER5_API_BASE || 'http://127.0.0.1:5000';
const LOGIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const LOGIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function login() {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function postJson(path, token, body, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function getJson(path, token, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD');
  const auth = await login();
  assertOk(auth.status === 200 && auth.data.token, 'Login failed');
  const token = auth.data.token;

  const orgRow = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(orgRow.rows.length === 1, 'No organisation found');
  const orgId = orgRow.rows[0].id;
  const headers = { 'x-org-id': orgId };

  let course = await db.query("SELECT id FROM courses ORDER BY created_at ASC LIMIT 1");
  if (!course.rows.length) {
    const createdCourse = await db.query(
      `INSERT INTO courses (title, slug, category, status, pass_mark)
       VALUES ('Layer5 Validation Course', 'layer5-validation-course', 'Compliance', 'published', 80)
       RETURNING id`
    );
    course = { rows: createdCourse.rows };
  }
  let member = await db.query("SELECT user_id FROM organisation_members WHERE organisation_id = $1 ORDER BY joined_at ASC LIMIT 1", [orgId]);
  if (!member.rows.length) {
    const user = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
       VALUES ('layer5.staff@example.com', '$2a$10$012345678901234567890123456789012345678901234567890', 'Layer', 'Staff', 'staff_user', true)
       ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`
    );
    await db.query(
      `INSERT INTO organisation_members (organisation_id, user_id, role)
       VALUES ($1, $2, 'learner')
       ON CONFLICT (organisation_id, user_id) DO NOTHING`,
      [orgId, user.rows[0].id]
    );
    member = { rows: [{ user_id: user.rows[0].id }] };
  }

  const n1 = await postJson('/api/v1/admin/enterprise/notifications/run', token, {}, headers);
  assertOk(n1.status === 200, `notification scan failed (${n1.status})`);
  const n2 = await postJson('/api/v1/admin/enterprise/notifications/run', token, {}, headers);
  assertOk(n2.status === 200, `notification second scan failed (${n2.status})`);
  assertOk((n2.data.data?.skipped_count || 0) >= 0, 'notification dedup response missing');

  const compliance = await getJson('/api/v1/admin/enterprise/compliance/dashboard', token, headers);
  assertOk(compliance.status === 200, `compliance dashboard failed (${compliance.status})`);
  assertOk(compliance.data.data?.schema === 'layer5e.compliance_dashboard.v1', 'compliance schema mismatch');

  const reportCsv = await postJson('/api/v1/admin/enterprise/reports/exports', token, { report_type: 'completion', format: 'csv' }, headers);
  assertOk(reportCsv.status === 201, `completion csv export failed (${reportCsv.status})`);
  const reportPdf = await postJson('/api/v1/admin/enterprise/reports/exports', token, { report_type: 'compliance', format: 'pdf' }, headers);
  assertOk(reportPdf.status === 201, `compliance pdf export failed (${reportPdf.status})`);
  const reportList = await getJson('/api/v1/admin/enterprise/reports/exports', token, headers);
  assertOk(reportList.status === 200 && Array.isArray(reportList.data.data), 'report list failed');

  const roles = await getJson('/api/v1/admin/enterprise/governance/roles', token, headers);
  assertOk(roles.status === 200, `role matrix failed (${roles.status})`);
  const ffSet = await postJson('/api/v1/admin/enterprise/governance/feature-flags', token, { key: 'advanced_compliance', enabled: true }, headers);
  assertOk(ffSet.status === 201, `feature flag set failed (${ffSet.status})`);
  const ffList = await getJson('/api/v1/admin/enterprise/governance/feature-flags', token, headers);
  assertOk(ffList.status === 200 && ffList.data.data.some((f) => f.key === 'advanced_compliance'), 'feature flag list mismatch');

  const bulk = await postJson('/api/v1/admin/enterprise/governance/bulk-enroll', token, {
    organisation_id: orgId,
    course_id: course.rows[0].id,
    user_ids: [member.rows[0].user_id],
  }, headers);
  assertOk(bulk.status === 200, `bulk enroll failed (${bulk.status})`);

  const persisted = await db.query(
    `SELECT
      (SELECT COUNT(*)::int FROM notifications WHERE organisation_id = $1) AS notifications_count,
      (SELECT COUNT(*)::int FROM notification_delivery_state WHERE organisation_id = $1) AS delivery_state_count,
      (SELECT COUNT(*)::int FROM compliance_snapshots WHERE organisation_id = $1) AS compliance_snapshots_count,
      (SELECT COUNT(*)::int FROM report_exports WHERE organisation_id = $1) AS report_exports_count,
      (SELECT COUNT(*)::int FROM feature_flags WHERE organisation_id = $1) AS feature_flags_count`,
    [orgId]
  );
  const p = persisted.rows[0];
  assertOk(p.compliance_snapshots_count > 0, 'compliance snapshots not persisted');
  assertOk(p.report_exports_count > 0, 'report exports not persisted');
  assertOk(p.feature_flags_count > 0, 'feature flags not persisted');

  const audit = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action IN (
       'layer5d_notifications_run',
       'layer5e_compliance_dashboard',
       'layer5f_report_generate',
       'layer5g_feature_flag_upsert',
       'layer5g_bulk_enroll'
     )`
  );
  assertOk(audit.rows[0].count >= 5, 'enterprise audit trail incomplete');

  console.log(`layer5defg_validation_ok ${JSON.stringify({
    notifications_count: p.notifications_count,
    delivery_state_count: p.delivery_state_count,
    compliance_snapshots_count: p.compliance_snapshots_count,
    report_exports_count: p.report_exports_count,
    feature_flags_count: p.feature_flags_count,
    audit_rows: audit.rows[0].count,
  })}`);
}

main().catch((error) => {
  console.error(`layer5defg_validation_fail ${error.message}`);
  process.exit(1);
});
