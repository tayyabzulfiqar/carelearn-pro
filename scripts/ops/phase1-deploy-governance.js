#!/usr/bin/env node
const { existsCommand, run, writeReport } = require('./common');

async function main() {
  const hasDocker = await existsCommand('docker');
  const report = {
    phase: '1B',
    checked_at: new Date().toISOString(),
    has_docker: hasDocker,
    passed: false,
    simulated: true,
    details: {},
  };

  if (!hasDocker) {
    report.details.blocker = 'Docker CLI unavailable, redeploy/rollback cannot be executed';
    const out = writeReport('phase1-deploy-governance', report);
    console.log(JSON.stringify({ out, ...report }));
    process.exit(1);
  }

  const cfg = await run('docker', ['compose', '-f', 'docker-compose.production.yml', 'config']);
  report.details.compose_config_exit = cfg.code;
  report.details.compose_config_preview = cfg.stdout.slice(0, 2000);
  report.passed = cfg.code === 0;
  const out = writeReport('phase1-deploy-governance', report);
  console.log(JSON.stringify({ out, ...report }));
  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

