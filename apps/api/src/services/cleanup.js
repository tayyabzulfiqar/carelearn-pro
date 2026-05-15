const db = require('../config/database');

async function runCleanup({ staleMinutes = 30, deadLetterDays = 30, monitoringDays = 14, workerHeartbeatMinutes = 60, releaseDays = 120 }) {
  const reclaimedLocks = await db.query(
    `UPDATE background_jobs
     SET state='queued', locked_at=NULL, locked_by=NULL, updated_at=NOW()
     WHERE state='processing'
       AND locked_at < NOW() - ($1 || ' minutes')::interval
     RETURNING id`,
    [String(staleMinutes)]
  );

  const deletedDeadLetter = await db.query(
    `DELETE FROM background_jobs
     WHERE state='dead_letter'
       AND updated_at < NOW() - ($1 || ' days')::interval
     RETURNING id`,
    [String(deadLetterDays)]
  );

  const deletedMonitoring = await db.query(
    `DELETE FROM monitoring_snapshots
     WHERE created_at < NOW() - ($1 || ' days')::interval
     RETURNING id`,
    [String(monitoringDays)]
  );

  const deletedHeartbeats = await db.query(
    `DELETE FROM worker_heartbeats
     WHERE last_seen_at < NOW() - ($1 || ' minutes')::interval
     RETURNING worker_id`,
    [String(workerHeartbeatMinutes)]
  );

  const deletedReleases = await db.query(
    `DELETE FROM release_metadata
     WHERE created_at < NOW() - ($1 || ' days')::interval
     RETURNING id`,
    [String(releaseDays)]
  );

  const orphanStorage = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM storage_objects so
     WHERE so.ref_type = 'media_asset'
       AND NOT EXISTS (SELECT 1 FROM media_assets ma WHERE ma.id = so.ref_id)`
  );

  return {
    reclaimed_processing_jobs: reclaimedLocks.rows.length,
    removed_dead_letter_jobs: deletedDeadLetter.rows.length,
    removed_monitoring_snapshots: deletedMonitoring.rows.length,
    removed_stale_worker_heartbeats: deletedHeartbeats.rows.length,
    removed_old_release_metadata: deletedReleases.rows.length,
    detected_orphan_storage_refs: orphanStorage.rows[0].count,
  };
}

module.exports = { runCleanup };
