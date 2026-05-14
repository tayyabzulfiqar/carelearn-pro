#!/usr/bin/env node
const { existsCommand, run, writeReport } = require('./common');

async function main() {
  const hasDocker = await existsCommand('docker');
  const hasDockerCompose = hasDocker;
  const hasNginxCli = await existsCommand('nginx');

  const report = {
    phase: '1A',
    checked_at: new Date().toISOString(),
    commands: {
      docker: hasDocker,
      docker_compose: hasDockerCompose,
      nginx: hasNginxCli,
    },
    passed: false,
    details: {},
  };

  if (!hasDocker) {
    report.details.blocker = 'Docker CLI unavailable on host';
    const out = writeReport('phase1-runtime-governance', report);
    console.log(JSON.stringify({ out, ...report }));
    process.exit(1);
  }

  const ps = await run('docker', ['compose', '-f', 'docker-compose.production.yml', 'ps']);
  report.details.compose_ps_exit = ps.code;
  report.details.compose_ps = ps.stdout.slice(0, 4000);
  report.passed = ps.code === 0;
  const out = writeReport('phase1-runtime-governance', report);
  console.log(JSON.stringify({ out, ...report }));
  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

