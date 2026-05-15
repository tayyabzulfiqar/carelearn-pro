#!/usr/bin/env node
const db = require('../config/database');

const API_BASE = process.env.LAYER6IJ_API_BASE || 'http://127.0.0.1:5050';
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
  const auth = await login();
  assertOk(auth.status === 200 && auth.data.token, 'login failed');
  const token = auth.data.token;
  const org = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(org.rows.length === 1, 'no org');
  const orgId = org.rows[0].id;
  const h = { 'x-org-id': orgId };

  const providerStatus = await api('/api/v1/admin/ops/providers/status', token, 'GET', null, h);
  assertOk(providerStatus.status === 200, 'provider status failed');
  const providers = providerStatus.data.data || {};

  const workerHealth = await api('/api/v1/admin/ops/worker/health', token, 'GET', null, h);
  assertOk(workerHealth.status === 200, 'worker health failed');
  const healthyWorkers = (workerHealth.data.data || []).filter((w) =>
    w.status === 'healthy' && new Date(w.last_seen_at).getTime() > Date.now() - (2 * 60 * 1000)
  );
  assertOk(healthyWorkers.length > 0, 'no workers active');

  const cleanupRun = await api('/api/v1/admin/ops/cleanup/run', token, 'POST', { task_key: `layer6ij-cleanup-${Date.now()}` }, h);
  assertOk(cleanupRun.status === 200, `cleanup run failed (${cleanupRun.status})`);

  const queueJob = await api('/api/v1/admin/ops/queue/jobs', token, 'POST', {
    queue_name: 'email_delivery',
    job_type: 'unsupported.job',
    dedup_key: `6ij-unsupported-${Date.now()}`,
    payload: {},
    max_attempts: 1,
  }, h);
  assertOk(queueJob.status === 201, 'unsupported job enqueue failed');
  await sleep(3000);

  let dead = await db.query("SELECT COUNT(*)::int AS count FROM background_jobs WHERE job_type='unsupported.job' AND state='dead_letter'");
  if (dead.rows[0].count === 0) {
    await api('/api/v1/admin/ops/queue/process/email_delivery?limit=20', token, 'POST', {}, h);
    dead = await db.query("SELECT COUNT(*)::int AS count FROM background_jobs WHERE job_type='unsupported.job' AND state='dead_letter'");
  }
  assertOk(dead.rows[0].count > 0, 'dead-letter behavior failed');

  let emailLive = { attempted: false, success: null, reason: 'not_live_ready' };
  if (providers.email_live_ready) {
    emailLive.attempted = true;
    const q = await api('/api/v1/admin/ops/email/queue', token, 'POST', {
      recipient_email: process.env.LAYER6_LIVE_EMAIL_TO || 'ops-validation@example.com',
      template_key: 'subscription_alert',
      payload: { message: 'Live provider validation test' },
      cooldown_hours: 1,
    }, h);
    assertOk(q.status === 201, 'live email queue failed');
    for (let i = 0; i < 25; i += 1) {
      const sent = await db.query(
        `SELECT status, payload
         FROM email_deliveries
         WHERE id = $1
         LIMIT 1`,
        [q.data?.data?.id]
      );
      if (sent.rows[0]?.status === 'sent') {
        emailLive.success = true;
        emailLive.provider_payload = sent.rows[0].payload || {};
        break;
      }
      if (sent.rows[0]?.status === 'failed') {
        emailLive.success = false;
        emailLive.reason = 'provider_failed';
        break;
      }
      await sleep(1000);
    }
    if (emailLive.success === null) {
      emailLive.success = false;
      emailLive.reason = 'timeout_waiting_for_send';
    }
  }

  let storageLive = { attempted: false, success: null, reason: 'not_live_ready' };
  if (providers.storage_live_ready) {
    storageLive.attempted = true;
    storageLive.success = false;
    storageLive.reason = 'manual-live-upload-required';
  }

  const metrics = await api('/api/v1/admin/ops/monitoring/metrics', token, 'GET', null, h);
  assertOk(metrics.status === 200, 'metrics failed');

  const audit = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action IN ('layer6_cleanup_run','layer6_worker_health','layer6_provider_status','layer6_monitoring_metrics')`
  );
  assertOk(audit.rows[0].count >= 3, 'audit rows missing');

  console.log(`layer6ij_validation_ok ${JSON.stringify({
    providers,
    email_live: emailLive,
    storage_live: storageLive,
    dead_letter_count: dead.rows[0].count,
    active_workers: healthyWorkers.length,
    cleanup_result: cleanupRun.data?.data || {},
    audit_rows: audit.rows[0].count,
  })}`);
}

main().catch((err) => {
  console.error(`layer6ij_validation_fail ${err.message}`);
  process.exit(1);
});
