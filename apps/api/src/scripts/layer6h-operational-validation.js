#!/usr/bin/env node
const db = require('../config/database');

const API_BASE = process.env.LAYER6H_API_BASE || 'http://127.0.0.1:5050';
const LOGIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const LOGIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function api(path, token, method = 'GET', body = null, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing SUPER_ADMIN credentials');
  const auth = await login();
  assertOk(auth.status === 200 && auth.data.token, 'Login failed');
  const token = auth.data.token;
  const org = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(org.rows.length === 1, 'No organisation found');
  const orgId = org.rows[0].id;
  const headers = { 'x-org-id': orgId };

  const health = await api('/api/v1/admin/ops/worker/health', token, 'GET', null, headers);
  assertOk(health.status === 200, `worker health endpoint failed (${health.status})`);
  assertOk(Array.isArray(health.data.data) && health.data.data.length > 0, 'no worker heartbeat found');

  const q1 = await api('/api/v1/admin/ops/email/queue', token, 'POST', {
    recipient_email: 'operational@example.com',
    template_key: 'compliance_reminder',
    payload: { message: 'Operational validation compliance reminder' },
    cooldown_hours: 24,
  }, headers);
  assertOk(q1.status === 201, `email queue failed (${q1.status})`);

  const q2 = await api('/api/v1/admin/ops/email/queue', token, 'POST', {
    recipient_email: 'operational@example.com',
    template_key: 'compliance_reminder',
    payload: { message: 'Operational validation compliance reminder' },
    cooldown_hours: 24,
  }, headers);
  assertOk(q2.status === 201, `email dedup queue call failed (${q2.status})`);
  assertOk(q2.data?.data?.queued === false, 'email dedup/cooldown did not suppress duplicate');

  for (let i = 0; i < 20; i += 1) {
    const sent = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM email_deliveries
       WHERE organisation_id = $1 AND recipient_email = 'operational@example.com' AND status = 'sent'`,
      [orgId]
    );
    if (sent.rows[0].count > 0) break;
    await sleep(1000);
  }
  const sentFinal = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM email_deliveries
     WHERE organisation_id = $1 AND recipient_email = 'operational@example.com' AND status = 'sent'`,
    [orgId]
  );
  assertOk(sentFinal.rows[0].count > 0, 'worker did not process queued email to sent state');

  await api('/api/v1/admin/ops/queue/jobs', token, 'POST', {
    queue_name: 'email_delivery',
    job_type: 'unsupported.job',
    dedup_key: `unsupported-${Date.now()}`,
    payload: {},
    max_attempts: 1,
  }, headers);
  for (let i = 0; i < 15; i += 1) {
    const dead = await db.query("SELECT COUNT(*)::int AS count FROM background_jobs WHERE job_type='unsupported.job' AND state='dead_letter'");
    if (dead.rows[0].count > 0) break;
    await sleep(1000);
  }
  const deadFinal = await db.query("SELECT COUNT(*)::int AS count FROM background_jobs WHERE job_type='unsupported.job' AND state='dead_letter'");
  assertOk(deadFinal.rows[0].count > 0, 'dead-letter retry exhaustion path failed');

  const mon = await api('/api/v1/admin/ops/monitoring/metrics', token, 'GET', null, headers);
  assertOk(mon.status === 200, `metrics endpoint failed (${mon.status})`);
  assertOk(Array.isArray(mon.data?.data?.active_workers), 'active_workers metric missing');

  const stats = await api('/api/v1/admin/ops/queue/stats', token, 'GET', null, headers);
  assertOk(stats.status === 200, 'queue stats unavailable');

  const audits = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action IN ('layer6_worker_health','layer6_email_queue','layer6_monitoring_metrics','layer6_queue_enqueue')`
  );
  assertOk(audits.rows[0].count >= 3, 'ops audit logs missing');

  console.log(`layer6h_validation_ok ${JSON.stringify({
    active_workers: mon.data?.data?.active_workers?.length || 0,
    queue_rows: stats.data?.data?.length || 0,
    dead_letter_count: deadFinal.rows[0].count,
    sent_email_count: sentFinal.rows[0].count,
    audit_rows: audits.rows[0].count,
  })}`);
}

main().catch((err) => {
  console.error(`layer6h_validation_fail ${err.message}`);
  process.exit(1);
});
