#!/usr/bin/env node
const db = require('../config/database');

const API_BASE = process.env.LAYER4_API_BASE || process.env.LAYER3_API_BASE || 'http://127.0.0.1:5000';
const LOGIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const LOGIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
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

async function login() {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
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
  const headers = { 'x-org-id': org.rows[0].id };

  const generated = await postJson(`${API_BASE}/api/v1/admin/cms/layer4/analytics/generate`, {}, token, headers);
  assertOk(generated.status === 200, `layer4 analytics generate failed (${generated.status})`);
  const viewed = await getJson(`${API_BASE}/api/v1/admin/cms/layer4/analytics`, token, headers);
  assertOk(viewed.status === 200, `layer4 analytics view failed (${viewed.status})`);

  const persisted = await db.query(
    `SELECT value
     FROM organisation_settings
     WHERE organisation_id = $1 AND key = 'layer4e_analytics_snapshot_last'
     LIMIT 1`,
    [org.rows[0].id]
  );
  assertOk(persisted.rows.length === 1, 'layer4e analytics snapshot missing');

  const analytics = viewed.data?.data?.analytics || {};
  assertOk(analytics.schema === 'layer4e.analytics_snapshot.v1', 'layer4e schema mismatch');
  const audit = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action IN ('layer4_analytics_generate', 'layer4_analytics_view')
       AND metadata->>'path' ILIKE '/api/v1/admin/cms/layer4/analytics%'`
  );
  assertOk(audit.rows[0].count >= 2, 'layer4e audit trail incomplete');

  console.log(`layer4e_analytics_ok ${JSON.stringify({
    courses: analytics.courses?.length || 0,
    difficult_topics: analytics.difficult_topics?.length || 0,
    audit_rows: audit.rows[0].count,
    persisted: true,
  })}`);
}

main().catch((error) => {
  console.error(`layer4e_analytics_fail ${error.message}`);
  process.exit(1);
});
