#!/usr/bin/env node
const db = require('../config/database');

const API_BASE = process.env.LAYER4_API_BASE || process.env.LAYER3_API_BASE || 'http://127.0.0.1:5000';
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

async function postJson(url, body, token, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function getJson(url, token, headers = {}) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD');
  const auth = await login();
  assertOk(auth.status === 200 && auth.data?.token, 'login failed');
  const token = auth.data.token;
  const org = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(org.rows.length > 0, 'no organisation found');
  const orgId = org.rows[0].id;
  const headers = { 'x-org-id': orgId };

  const run = await postJson(`${API_BASE}/api/v1/admin/cms/layer4/compliance/run`, {}, token, headers);
  assertOk(run.status === 200, `compliance run failed (${run.status})`);
  const view = await getJson(`${API_BASE}/api/v1/admin/cms/layer4/compliance`, token, headers);
  assertOk(view.status === 200, `compliance view failed (${view.status})`);

  const persisted = await db.query(
    `SELECT value
     FROM organisation_settings
     WHERE organisation_id = $1 AND key = 'layer4f_compliance_snapshot_last'
     LIMIT 1`,
    [orgId]
  );
  assertOk(persisted.rows.length === 1, 'layer4f compliance snapshot missing');
  const notifCount = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE organisation_id = $1
       AND type IN ('mandatory_course_alert', 'certificate_expiry_reminder')`,
    [orgId]
  );

  const compliance = view.data?.data?.compliance || {};
  assertOk(compliance.schema === 'layer4f.compliance_snapshot.v1', 'layer4f schema mismatch');
  const audit = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action IN ('layer4_compliance_run', 'layer4_compliance_view')
       AND metadata->>'path' ILIKE '/api/v1/admin/cms/layer4/compliance%'`
  );
  assertOk(audit.rows[0].count >= 2, 'layer4f audit trail incomplete');

  console.log(`layer4f_compliance_ok ${JSON.stringify({
    totals: compliance.totals || {},
    notifications_total: notifCount.rows[0].count,
    audit_rows: audit.rows[0].count,
    persisted: true,
  })}`);
}

main().catch((error) => {
  console.error(`layer4f_compliance_fail ${error.message}`);
  process.exit(1);
});
