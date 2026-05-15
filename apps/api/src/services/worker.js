const { claimNextJob, completeJob, failJob, recordExecution } = require('./queue');
const { sendQueuedEmail } = require('./email');

async function processSingleJob(queueName) {
  const job = await claimNextJob(queueName);
  if (!job) return { processed: false };
  const startedAt = new Date();
  try {
    let result = { ok: true };
    if (job.job_type === 'email.send') {
      result = await sendQueuedEmail(job.payload?.email_delivery_id);
    } else if (job.job_type === 'notification.scan') {
      result = { queued: true };
    } else if (job.job_type === 'compliance.scan') {
      result = { queued: true };
    } else if (job.job_type === 'report.generate') {
      result = { queued: true };
    } else if (job.job_type === 'certificate.generate') {
      result = { queued: true };
    } else if (job.job_type === 'subscription.scan') {
      result = { queued: true };
    } else {
      throw new Error(`Unsupported job type: ${job.job_type}`);
    }
    await completeJob(job.id, result || {});
    await recordExecution(job.id, job.organisation_id, Number(job.attempts || 0) + 1, 'succeeded', startedAt, null, result || {});
    return { processed: true, job_id: job.id, state: 'succeeded' };
  } catch (err) {
    await failJob(job, err.message);
    await recordExecution(job.id, job.organisation_id, Number(job.attempts || 0) + 1, 'failed', startedAt, err.message, {});
    return { processed: true, job_id: job.id, state: 'failed', error: err.message };
  }
}

module.exports = { processSingleJob };
