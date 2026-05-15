const db = require('../config/database');
const { enqueueJob } = require('./queue');

async function withSchedulerLock(taskKey, lockSeconds, runner) {
  const lock = await db.query(
    `INSERT INTO scheduler_runs (task_key, lock_until, updated_at)
     VALUES ($1, NOW() + ($2 || ' seconds')::interval, NOW())
     ON CONFLICT (task_key)
     DO UPDATE SET
       lock_until = CASE WHEN scheduler_runs.lock_until IS NULL OR scheduler_runs.lock_until < NOW()
                         THEN NOW() + ($2 || ' seconds')::interval
                         ELSE scheduler_runs.lock_until END,
       updated_at = NOW()
     RETURNING task_key, lock_until`,
    [taskKey, String(lockSeconds)]
  );
  if (!lock.rows.length) return { skipped: true };
  const active = new Date(lock.rows[0].lock_until).getTime() > Date.now() + 1000;
  if (!active) return { skipped: true };

  const started = Date.now();
  try {
    const result = await runner();
    const duration = Date.now() - started;
    await db.query(
      `UPDATE scheduler_runs
       SET last_run_at=NOW(), last_status='success', run_count=run_count+1, last_duration_ms=$2, lock_until=NULL, updated_at=NOW()
       WHERE task_key=$1`,
      [taskKey, duration]
    );
    return { skipped: false, result };
  } catch (err) {
    const duration = Date.now() - started;
    await db.query(
      `UPDATE scheduler_runs
       SET last_run_at=NOW(), last_status='failed', fail_count=fail_count+1, last_duration_ms=$2, last_error=$3, lock_until=NULL, updated_at=NOW()
       WHERE task_key=$1`,
      [taskKey, duration, err.message]
    );
    throw err;
  }
}

async function runAutomationSweep(organisationId) {
  const jobs = [
    { queue: 'notifications', type: 'notification.scan', dedup: `notifications:${new Date().toISOString().slice(0, 13)}` },
    { queue: 'compliance', type: 'compliance.scan', dedup: `compliance:${new Date().toISOString().slice(0, 13)}` },
    { queue: 'subscriptions', type: 'subscription.scan', dedup: `subscription:${new Date().toISOString().slice(0, 13)}` },
  ];
  for (const job of jobs) {
    await enqueueJob({
      organisationId,
      queueName: job.queue,
      jobType: job.type,
      dedupKey: job.dedup,
      payload: { organisation_id: organisationId, source: 'scheduler' },
      maxAttempts: 3,
    });
  }
  return { queued: jobs.length };
}

module.exports = { withSchedulerLock, runAutomationSweep };
