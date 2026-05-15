const os = require('os');
const { randomUUID } = require('crypto');
const db = require('../config/database');

async function enqueueJob({
  organisationId = null,
  queueName,
  jobType,
  dedupKey = null,
  payload = {},
  maxAttempts = 3,
  delaySeconds = 0,
}) {
  const result = await db.query(
    `INSERT INTO background_jobs
     (organisation_id, queue_name, job_type, dedup_key, payload, max_attempts, available_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' seconds')::interval)
     ON CONFLICT (organisation_id, queue_name, dedup_key)
     DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING *`,
    [organisationId, queueName, jobType, dedupKey, payload, maxAttempts, String(delaySeconds)]
  );
  return result.rows[0];
}

async function claimNextJob(queueName) {
  const workerId = `${os.hostname()}:${process.pid}`;
  const claimed = await db.query(
    `WITH candidate AS (
       SELECT id
       FROM background_jobs
       WHERE queue_name = $1
         AND state = 'queued'
         AND available_at <= NOW()
       ORDER BY created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE background_jobs b
     SET state='processing', locked_at=NOW(), locked_by=$2, updated_at=NOW()
     FROM candidate
     WHERE b.id = candidate.id
     RETURNING b.*`,
    [queueName, workerId]
  );
  return claimed.rows[0] || null;
}

async function completeJob(jobId, resultPayload = {}) {
  await db.query(
    `UPDATE background_jobs
     SET state='succeeded', result=$2, updated_at=NOW()
     WHERE id=$1`,
    [jobId, resultPayload]
  );
}

async function failJob(job, errorMessage) {
  const attempts = Number(job.attempts || 0) + 1;
  const retryable = attempts < Number(job.max_attempts || 3);
  const nextState = retryable ? 'queued' : 'dead_letter';
  const delay = retryable ? Math.min(300, attempts * 30) : 0;
  await db.query(
    `UPDATE background_jobs
     SET attempts=$2,
         state=$3,
         last_error=$4,
         available_at=NOW() + ($5 || ' seconds')::interval,
         updated_at=NOW()
     WHERE id=$1`,
    [job.id, attempts, nextState, String(errorMessage || 'unknown'), String(delay)]
  );
}

async function recordExecution(jobId, organisationId, attemptNumber, state, startedAt, error = null, metadata = {}) {
  const endedAt = new Date();
  const duration = Math.max(0, endedAt.getTime() - startedAt.getTime());
  await db.query(
    `INSERT INTO job_executions
     (id, job_id, organisation_id, attempt_number, state, started_at, ended_at, duration_ms, error, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [randomUUID(), jobId, organisationId, attemptNumber, state, startedAt, endedAt, duration, error, metadata]
  );
}

module.exports = {
  enqueueJob,
  claimNextJob,
  completeJob,
  failJob,
  recordExecution,
};
