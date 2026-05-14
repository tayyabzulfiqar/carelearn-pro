#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { existsCommand, writeReport } = require('./common');

function hashFile(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function main() {
  const backupScript = path.resolve('scripts/backup-postgres.sh');
  const restoreScript = path.resolve('scripts/restore-postgres.sh');
  const hasDocker = await existsCommand('docker');
  const backupDir = path.resolve('backups');

  const report = {
    phase: '1D',
    checked_at: new Date().toISOString(),
    scripts: {
      backup: fs.existsSync(backupScript),
      restore: fs.existsSync(restoreScript),
    },
    script_hashes: {},
    has_docker: hasDocker,
    backup_dir_exists: fs.existsSync(backupDir),
    passed: false,
  };

  if (report.scripts.backup) report.script_hashes.backup = hashFile(backupScript);
  if (report.scripts.restore) report.script_hashes.restore = hashFile(restoreScript);

  report.passed = report.scripts.backup && report.scripts.restore && hasDocker;
  if (!hasDocker) report.blocker = 'Docker CLI unavailable, cannot execute backup/restore run';

  const out = writeReport('phase1-backup-recovery', report);
  console.log(JSON.stringify({ out, ...report }));
  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

