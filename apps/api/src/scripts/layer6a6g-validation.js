#!/usr/bin/env node
const db = require('../config/database');

const API_BASE = process.env.LAYER6_API_BASE || 'http://127.0.0.1:5050';
const LOGIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const LOGIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
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

async function req(path, token, method = 'GET', body = null, headers = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing SUPER_ADMIN creds');
  const auth = await login();
  assertOk(auth.status === 200 && auth.data.token, 'Login failed');
  const token = auth.data.token;
  const org = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(org.rows.length === 1, 'No organisation found');
  const orgId = org.rows[0].id;
  const headers = { 'x-org-id': orgId };

  const emailQueue1 = await req('/api/v1/admin/ops/email/queue', token, 'POST', {
    recipient_email: 'ops-check@example.com',
    template_key: 'subscription_alert',
    payload: { message: 'Ops check alert' },
    cooldown_hours: 24,
  }, headers);
  assertOk(emailQueue1.status === 201, `email queue failed (${emailQueue1.status})`);
  const emailQueue2 = await req('/api/v1/admin/ops/email/queue', token, 'POST', {
    recipient_email: 'ops-check@example.com',
    template_key: 'subscription_alert',
    payload: { message: 'Ops check alert' },
    cooldown_hours: 24,
  }, headers);
  assertOk(emailQueue2.status === 201, `email queue dedup request failed (${emailQueue2.status})`);

  const processRun = await req('/api/v1/admin/ops/queue/process/email_delivery?limit=10', token, 'POST', {}, headers);
  assertOk(processRun.status === 200, `queue process failed (${processRun.status})`);

  const sched = await req('/api/v1/admin/ops/scheduler/run', token, 'POST', { task_key: 'layer6_validation', lock_seconds: 120 }, headers);
  assertOk(sched.status === 200, `scheduler run failed (${sched.status})`);

  const mon = await req('/api/v1/admin/ops/monitoring/snapshot', token, 'POST', {}, headers);
  assertOk(mon.status === 200 && mon.data.checksum, 'monitoring snapshot failed');

  const release = await req('/api/v1/admin/ops/release/register', token, 'POST', {
    release_tag: 'layer6-validation',
    commit_hash: process.env.LAYER6_COMMIT_HASH || 'dev-local',
    startup_check_passed: true,
    metadata: { source: 'layer6a6g-validation' },
  }, headers);
  assertOk(release.status === 201, `release register failed (${release.status})`);

  const preflight = await req('/api/v1/admin/ops/release/preflight', token, 'GET', null, headers);
  assertOk([200, 400].includes(preflight.status), 'preflight unexpected status');

  const recovery = await req('/api/v1/admin/ops/recovery/artifacts', token, 'POST', {
    environment: 'staging',
    artifact_type: 'postgres_backup',
    storage_path: `backups/staging/${Date.now()}-pg.dump`,
    status: 'verified',
    metadata: { checksum_test: true },
  }, headers);
  assertOk(recovery.status === 201, `recovery record failed (${recovery.status})`);

  const stats = await req('/api/v1/admin/ops/queue/stats', token, 'GET', null, headers);
  assertOk(stats.status === 200, 'queue stats failed');
  const emailStats = await req('/api/v1/admin/ops/email/stats', token, 'GET', null, headers);
  assertOk(emailStats.status === 200, 'email stats failed');

  const dbCheck = await db.query(
    `SELECT
      (SELECT COUNT(*)::int FROM background_jobs WHERE organisation_id = $1) AS jobs,
      (SELECT COUNT(*)::int FROM job_executions je JOIN background_jobs bj ON bj.id = je.job_id WHERE bj.organisation_id = $1) AS job_execs,
      (SELECT COUNT(*)::int FROM email_deliveries WHERE organisation_id = $1) AS emails,
      (SELECT COUNT(*)::int FROM scheduler_runs) AS scheduler_runs,
      (SELECT COUNT(*)::int FROM monitoring_snapshots) AS monitoring_snapshots,
      (SELECT COUNT(*)::int FROM release_metadata) AS releases,
      (SELECT COUNT(*)::int FROM recovery_artifacts) AS recoveries`,
    [orgId]
  );
  const d = dbCheck.rows[0];
  assertOk(d.jobs > 0, 'no jobs persisted');
  assertOk(d.emails > 0, 'no emails persisted');
  assertOk(d.scheduler_runs > 0, 'no scheduler runs persisted');
  assertOk(d.monitoring_snapshots > 0, 'no monitoring snapshots persisted');
  assertOk(d.releases > 0, 'no release metadata persisted');
  assertOk(d.recoveries > 0, 'no recovery artifacts persisted');

  const audit = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM audit_logs
     WHERE action IN (
       'layer6_queue_enqueue','layer6_queue_process','layer6_email_queue',
       'layer6_scheduler_run','layer6_monitoring_snapshot','layer6_release_register','layer6_recovery_record'
     )`
  );
  assertOk(audit.rows[0].count >= 5, 'insufficient ops audit logs');

  console.log(`layer6a6g_validation_ok ${JSON.stringify({
    jobs: d.jobs,
    job_executions: d.job_execs,
    emails: d.emails,
    scheduler_runs: d.scheduler_runs,
    monitoring_snapshots: d.monitoring_snapshots,
    releases: d.releases,
    recoveries: d.recoveries,
    audit_rows: audit.rows[0].count,
    preflight_status: preflight.status,
  })}`);
}

main().catch((err) => {
  console.error(`layer6a6g_validation_fail ${err.message}`);
  process.exit(1);
});
