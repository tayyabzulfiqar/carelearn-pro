#!/usr/bin/env node
const db = require('../config/database');

const API_BASE = process.env.LAYER4_API_BASE || process.env.LAYER3_API_BASE || 'http://127.0.0.1:5000';
const LOGIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const LOGIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

function stableSmartRuntime(value) {
  if (!value) return value;
  const clone = JSON.parse(JSON.stringify(value));
  delete clone.generated_at;
  return clone;
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD');
  const login = await postJson(`${API_BASE}/api/v1/auth/login`, { email: LOGIN_EMAIL, password: LOGIN_PASSWORD });
  assertOk(login.status === 200 && login.data?.token, 'login failed');
  const token = login.data.token;

  const [orgRow, userRow, snapshotRow] = await Promise.all([
    db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1'),
    db.query('SELECT id FROM users WHERE email = $1 LIMIT 1', [LOGIN_EMAIL]),
    db.query(
      `SELECT key
       FROM organisation_settings
       WHERE key LIKE 'layer2_publish_snapshot_%'
       ORDER BY updated_at DESC
       LIMIT 1`
    ),
  ]);
  assertOk(orgRow.rows.length > 0, 'no organisation found');
  assertOk(userRow.rows.length > 0, 'admin user not found');
  assertOk(snapshotRow.rows.length > 0, 'no published snapshot found; run Layer 2/3 publish flow first');

  const orgId = orgRow.rows[0].id;
  const userId = userRow.rows[0].id;
  const key = snapshotRow.rows[0].key;
  const courseId = key.replace('layer2_publish_snapshot_', '');
  const headers = { 'x-org-id': orgId };

  const first = await getJson(`${API_BASE}/api/v1/courses/${courseId}/smart-runtime`, token, headers);
  assertOk(first.status === 200, `smart-runtime first call failed (${first.status})`);
  const second = await getJson(`${API_BASE}/api/v1/courses/${courseId}/smart-runtime`, token, headers);
  assertOk(second.status === 200, `smart-runtime second call failed (${second.status})`);

  assertOk(
    JSON.stringify(stableSmartRuntime(first.data.smart_runtime)) === JSON.stringify(stableSmartRuntime(second.data.smart_runtime)),
    'smart-runtime is not deterministic across repeated calls'
  );

  const persisted = await db.query(
    `SELECT value
     FROM organisation_settings
     WHERE organisation_id = $1 AND key = $2
     LIMIT 1`,
    [orgId, `layer4d_smart_runtime_${courseId}_${userId}`]
  );
  assertOk(persisted.rows.length === 1, 'smart-runtime persistence key missing');
  const audit = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action = 'learner_smart_runtime_view'
       AND metadata->>'path' ILIKE '/api/v1/courses/%/smart-runtime'`
  );
  assertOk(audit.rows[0].count > 0, 'smart-runtime audit log missing');

  console.log(`layer4d_smart_runtime_ok ${JSON.stringify({
    course_id: courseId,
    recommendation_action: first.data.smart_runtime?.recommendations?.action || null,
    weak_topics: first.data.smart_runtime?.recommendations?.weak_topics?.length || 0,
    audit_rows: audit.rows[0].count,
    persisted: true,
  })}`);
}

main().catch((error) => {
  console.error(`layer4d_smart_runtime_fail ${error.message}`);
  process.exit(1);
});
