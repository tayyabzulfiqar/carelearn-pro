const { randomUUID } = require('crypto');
const db = require('./config/database');
const { processSingleJob } = require('./services/worker');

const QUEUES = (process.env.WORKER_QUEUES || 'email_delivery,notifications,compliance,subscriptions,reports,exports,certificates')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY || 2));
const POLL_MS = Math.max(250, Number(process.env.WORKER_POLL_MS || 1500));
const HEARTBEAT_MS = Math.max(1000, Number(process.env.WORKER_HEARTBEAT_MS || 10000));
const workerId = process.env.WORKER_ID || `worker-${process.pid}-${randomUUID().slice(0, 8)}`;

let stopping = false;
let processedCount = 0;
let failedCount = 0;

async function upsertHeartbeat(status = 'healthy') {
  await db.query(
    `INSERT INTO worker_heartbeats (worker_id, status, queues, concurrency, processed_count, failed_count, last_seen_at, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)
     ON CONFLICT (worker_id)
     DO UPDATE SET
       status = EXCLUDED.status,
       queues = EXCLUDED.queues,
       concurrency = EXCLUDED.concurrency,
       processed_count = EXCLUDED.processed_count,
       failed_count = EXCLUDED.failed_count,
       last_seen_at = NOW(),
       metadata = EXCLUDED.metadata`,
    [workerId, status, QUEUES, CONCURRENCY, processedCount, failedCount, { poll_ms: POLL_MS, pid: process.pid }]
  );
}

async function processLoop(slot) {
  while (!stopping) {
    let didWork = false;
    for (const queueName of QUEUES) {
      const result = await processSingleJob(queueName);
      if (result.processed) {
        didWork = true;
        processedCount += 1;
        if (result.state === 'failed') failedCount += 1;
      }
    }
    if (!didWork) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
}

async function start() {
  console.log(`Worker starting: ${workerId} queues=${QUEUES.join(',')} concurrency=${CONCURRENCY}`);
  await upsertHeartbeat('starting');
  const hbTimer = setInterval(() => {
    upsertHeartbeat('healthy').catch((err) => {
      console.error(`worker heartbeat failed: ${err.message}`);
    });
  }, HEARTBEAT_MS);
  hbTimer.unref();

  const slots = [];
  for (let i = 0; i < CONCURRENCY; i += 1) {
    slots.push(processLoop(i));
  }
  await Promise.all(slots);
}

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`Worker shutdown requested by ${signal}`);
  try {
    await upsertHeartbeat('stopped');
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch(async (err) => {
  console.error('Worker fatal error', err);
  try {
    await upsertHeartbeat('degraded');
  } catch (_e) {
    // noop
  }
  process.exit(1);
});
