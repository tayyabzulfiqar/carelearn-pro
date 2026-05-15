const os = require('os');
const { randomUUID, createHash } = require('crypto');
const db = require('../config/database');
const { enqueueJob } = require('../services/queue');
const { processSingleJob } = require('../services/worker');
const { queueEmail } = require('../services/email');
const { saveObject, sha256 } = require('../services/storage');
const { withSchedulerLock, runAutomationSweep } = require('../services/scheduler');

function orgId(req) {
  return req.scopedOrganisationId || req.tenant?.organisationId || req.headers['x-org-id'] || null;
}

function envFingerprint() {
  const critical = [
    process.env.NODE_ENV || '',
    process.env.CORS_ORIGIN || '',
    process.env.JWT_SECRET ? 'jwt:set' : 'jwt:missing',
    process.env.DATABASE_URL ? 'db:set' : 'db:missing',
    process.env.STORAGE_PROVIDER || 'local',
    process.env.EMAIL_PROVIDER || 'local_log',
  ];
  return createHash('sha256').update(critical.join('|')).digest('hex');
}

exports.enqueue = async (req, res, next) => {
  try {
    const organisationId = orgId(req);
    const { queue_name, job_type, dedup_key, payload = {}, max_attempts = 3, delay_seconds = 0 } = req.body || {};
    const job = await enqueueJob({
      organisationId,
      queueName: queue_name,
      jobType: job_type,
      dedupKey: dedup_key,
      payload,
      maxAttempts: max_attempts,
      delaySeconds: delay_seconds,
    });
    res.status(201).json({ success: true, data: job });
  } catch (err) { next(err); }
};

exports.processQueue = async (req, res, next) => {
  try {
    const queueName = req.params.queueName;
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 200);
    const out = [];
    for (let i = 0; i < limit; i += 1) {
      const result = await processSingleJob(queueName);
      if (!result.processed) break;
      out.push(result);
    }
    res.json({ success: true, data: { queue: queueName, processed: out.length, results: out } });
  } catch (err) { next(err); }
};

exports.queueStats = async (req, res, next) => {
  try {
    const organisationId = orgId(req);
    const stats = await db.query(
      `SELECT queue_name, state, COUNT(*)::int AS count
       FROM background_jobs
       WHERE organisation_id IS NOT DISTINCT FROM $1
       GROUP BY queue_name, state
       ORDER BY queue_name, state`,
      [organisationId]
    );
    res.json({ success: true, data: stats.rows });
  } catch (err) { next(err); }
};

exports.queueEmail = async (req, res, next) => {
  try {
    const organisationId = orgId(req);
    const { user_id = null, recipient_email, template_key, payload = {}, cooldown_hours = 24 } = req.body || {};
    const result = await queueEmail({
      organisationId,
      userId: user_id,
      recipientEmail: recipient_email,
      templateKey: template_key,
      payload,
      cooldownHours: cooldown_hours,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.emailStats = async (req, res, next) => {
  try {
    const organisationId = orgId(req);
    const rows = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM email_deliveries
       WHERE organisation_id IS NOT DISTINCT FROM $1
       GROUP BY status
       ORDER BY status`,
      [organisationId]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

exports.storeObject = async (req, res, next) => {
  try {
    const organisationId = orgId(req);
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file required' });
    const refType = req.body.ref_type || 'upload';
    const stored = await saveObject({
      organisationId,
      refType,
      refId: req.body.ref_id || null,
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      createdBy: req.user.id,
    });
    res.status(201).json({ success: true, data: stored });
  } catch (err) { next(err); }
};

exports.storageIntegrity = async (req, res, next) => {
  try {
    const organisationId = orgId(req);
    const rows = await db.query(
      `SELECT id, checksum_sha256, byte_size, object_key
       FROM storage_objects
       WHERE organisation_id IS NOT DISTINCT FROM $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [organisationId]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

exports.storageSignedUrl = async (req, res, next) => {
  try {
    const { getSignedDownloadUrl } = require('../services/storage');
    const objectKey = req.query.object_key;
    if (!objectKey) return res.status(400).json({ error: 'object_key required' });
    const signed = await getSignedDownloadUrl(objectKey, Number(req.query.expires_in || 900));
    if (!signed) return res.status(400).json({ error: 'Signed URLs unsupported for current storage provider' });
    res.json({ success: true, data: { object_key: objectKey, signed_url: signed } });
  } catch (err) { next(err); }
};

exports.runScheduler = async (req, res, next) => {
  try {
    const organisationId = orgId(req);
    const taskKey = req.body.task_key || 'default_automation';
    const lockSeconds = Math.min(Math.max(Number(req.body.lock_seconds || 300), 30), 3600);
    const result = await withSchedulerLock(taskKey, lockSeconds, async () => runAutomationSweep(organisationId));
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

exports.schedulerHistory = async (_req, res, next) => {
  try {
    const rows = await db.query('SELECT * FROM scheduler_runs ORDER BY updated_at DESC LIMIT 100');
    res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

exports.monitoringSnapshot = async (_req, res, next) => {
  try {
    const jobs = await db.query(
      `SELECT state, COUNT(*)::int AS count
       FROM background_jobs
       GROUP BY state`
    );
    const memory = process.memoryUsage();
    const payload = {
      schema: 'layer6e.monitoring_snapshot.v1',
      hostname: os.hostname(),
      pid: process.pid,
      memory_rss: memory.rss,
      memory_heap_used: memory.heapUsed,
      queue_states: jobs.rows,
      captured_at: new Date().toISOString(),
    };
    const checksum = sha256(Buffer.from(JSON.stringify(payload)));
    await db.query(
      'INSERT INTO monitoring_snapshots (snapshot_type, payload, checksum) VALUES ($1,$2,$3)',
      ['runtime_health', payload, checksum]
    );
    res.json({ success: true, data: payload, checksum });
  } catch (err) { next(err); }
};

exports.metrics = async (_req, res, next) => {
  try {
    const queueLag = await db.query(
      `SELECT queue_name,
              COUNT(*) FILTER (WHERE state='queued')::int AS queued,
              COUNT(*) FILTER (WHERE state='processing')::int AS processing,
              COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE state='queued'))), 0)::int AS lag_seconds
       FROM background_jobs
       GROUP BY queue_name
       ORDER BY queue_name`
    );
    const failedJobs = await db.query("SELECT COUNT(*)::int AS count FROM background_jobs WHERE state IN ('failed','dead_letter')");
    const workers = await db.query(
      `SELECT worker_id, status, queues, concurrency, processed_count, failed_count, last_seen_at
       FROM worker_heartbeats
       WHERE last_seen_at > NOW() - interval '2 minutes'
       ORDER BY last_seen_at DESC`
    );
    res.json({
      success: true,
      data: {
        schema: 'layer6h.metrics.v1',
        uptime_seconds: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        queue_lag: queueLag.rows,
        failed_jobs_total: failedJobs.rows[0].count,
        active_workers: workers.rows,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.monitoringHistory = async (_req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT id, snapshot_type, checksum, created_at
       FROM monitoring_snapshots
       ORDER BY created_at DESC
       LIMIT 200`
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

exports.releaseRegister = async (req, res, next) => {
  try {
    const { release_tag, commit_hash, startup_check_passed = false, metadata = {} } = req.body || {};
    const row = await db.query(
      `INSERT INTO release_metadata
       (release_tag, commit_hash, env_fingerprint, startup_check_passed, created_by, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [release_tag, commit_hash, envFingerprint(), Boolean(startup_check_passed), req.user.id, metadata]
    );
    res.status(201).json({ success: true, data: row.rows[0] });
  } catch (err) { next(err); }
};

exports.releaseHistory = async (_req, res, next) => {
  try {
    const rows = await db.query('SELECT * FROM release_metadata ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

exports.envPreflight = async (_req, res) => {
  const checks = {
    jwt_secret: Boolean(process.env.JWT_SECRET),
    database_url: Boolean(process.env.DATABASE_URL),
    cors_origin: Boolean(process.env.CORS_ORIGIN),
    no_localhost_cors: !(process.env.CORS_ORIGIN || '').includes('localhost'),
    node_env: process.env.NODE_ENV || 'development',
  };
  const ok = checks.jwt_secret && checks.database_url && checks.cors_origin;
  res.status(ok ? 200 : 400).json({ success: ok, data: { checks, env_fingerprint: envFingerprint() } });
};

exports.recoveryRecord = async (req, res, next) => {
  try {
    const { environment, artifact_type, storage_path, status = 'created', metadata = {} } = req.body || {};
    const checksum = sha256(Buffer.from(`${storage_path}|${JSON.stringify(metadata)}`));
    const row = await db.query(
      `INSERT INTO recovery_artifacts
       (id, environment, artifact_type, storage_path, checksum_sha256, status, metadata, created_by, verified_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [randomUUID(), environment, artifact_type, storage_path, checksum, status, metadata, req.user.id, status === 'verified' ? new Date() : null]
    );
    res.status(201).json({ success: true, data: row.rows[0] });
  } catch (err) { next(err); }
};

exports.recoveryHistory = async (req, res, next) => {
  try {
    const env = req.query.environment || null;
    const rows = await db.query(
      `SELECT *
       FROM recovery_artifacts
       WHERE ($1::text IS NULL OR environment = $1)
       ORDER BY created_at DESC
       LIMIT 200`,
      [env]
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) { next(err); }
};

exports.workerHealth = async (_req, res, next) => {
  try {
    const rows = await db.query(
      `SELECT worker_id, status, queues, concurrency, processed_count, failed_count, last_seen_at, started_at, metadata
       FROM worker_heartbeats
       ORDER BY last_seen_at DESC
       LIMIT 50`
    );
    res.json({ success: true, data: rows.rows });
  } catch (err) {
    next(err);
  }
};
