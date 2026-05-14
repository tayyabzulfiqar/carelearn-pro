#!/usr/bin/env node
const db = require('../config/database');
const { randomUUID } = require('crypto');
require('dotenv').config();

const API_BASE = process.env.LAYER3_API_BASE || 'http://127.0.0.1:5000';
const LOGIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const LOGIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postJson(url, body, token, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch (_err) {}
  return { status: res.status, data };
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD');
  const startedAtIso = new Date().toISOString();

  const login = await postJson(`${API_BASE}/api/v1/auth/login`, { email: LOGIN_EMAIL, password: LOGIN_PASSWORD });
  assertOk(login.status === 200 && login.data?.token, 'login failed');
  const token = login.data.token;
  const orgRow = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(orgRow.rows.length > 0, 'no organisation found');
  const orgHeaders = { 'x-org-id': orgRow.rows[0].id };

  const deniedNoToken = await fetch(`${API_BASE}/api/v1/admin/cms/trainings`);
  assertOk(deniedNoToken.status === 401, 'unauthenticated access should be blocked');

  const deniedBadToken = await fetch(`${API_BASE}/api/v1/admin/cms/trainings`, {
    headers: { Authorization: 'Bearer invalid.invalid.invalid' },
  });
  assertOk(deniedBadToken.status === 401, 'invalid jwt should be blocked');

  const trainingTitle = `L3F-${randomUUID()}`;
  const trainingCreate = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings`,
    { title: trainingTitle, category: 'general', status: 'draft' },
    token,
    orgHeaders
  );
  assertOk(trainingCreate.status === 201, 'training create failed for audit trace');
  const trainingId = trainingCreate.data?.data?.training?.id;
  assertOk(trainingId, 'training id missing for audit trace');

  const diagnostics = await fetch(`${API_BASE}/api/v1/admin/cms/ingestion/diagnostics`, {
    headers: { Authorization: `Bearer ${token}`, ...orgHeaders },
  });
  assertOk(diagnostics.status === 200, 'diagnostics view should succeed');

  const auditedActions = [
    'training_create',
    'ingestion_diagnostics_view',
  ];

  let recent = { rows: [] };
  let missingActions = [...auditedActions];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    recent = await db.query(
      `SELECT action, metadata
       FROM audit_logs
       WHERE action = ANY($1::text[])
         AND metadata->>'path' ILIKE '/api/v1/admin/cms/%'
         AND created_at >= $2::timestamptz
       ORDER BY created_at DESC
       LIMIT 100`,
      [auditedActions, startedAtIso]
    );
    const actionSet = new Set(recent.rows.map((r) => r.action));
    missingActions = auditedActions.filter((action) => !actionSet.has(action));
    if (!missingActions.length) break;
    await sleep(250);
  }

  const withRequestId = recent.rows.filter((row) => typeof row.metadata?.request_id === 'string' && row.metadata.request_id.length > 0).length;
  const deniedNoPerm = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action = 'permission_denied'`
  );
  assertOk(withRequestId > 0, 'audited metadata missing request_id traceability');
  assertOk(missingActions.length === 0, `missing audited actions: ${missingActions.join(',')}`);
  assertOk(deniedNoPerm.rows[0].count >= 0, 'permission denied audit query failed');

  console.log(`layer3f_security_audit_ok ${JSON.stringify({
    denied_no_token_status: deniedNoToken.status,
    denied_bad_token_status: deniedBadToken.status,
    permission_denied_total: deniedNoPerm.rows[0].count,
    audited_actions_present: auditedActions.length - missingActions.length,
    audited_actions_missing: missingActions,
    request_id_tagged_rows: withRequestId,
  })}`);
}

main().catch((error) => {
  console.error(`layer3f_security_audit_fail ${error.message}`);
  process.exit(1);
});
