#!/usr/bin/env node
const path = require('path');
const { run, writeReport } = require('./common');

const checks = [
  { id: '1C', script: 'phase1-env-governance.js' },
  { id: '1A', script: 'phase1-runtime-governance.js' },
  { id: '1B', script: 'phase1-deploy-governance.js' },
  { id: '1D', script: 'phase1-backup-recovery.js' },
  { id: '1E', script: 'phase1-monitoring-observability.js' },
  { id: '1F', script: 'phase1-staging-safety.js' },
];

async function main() {
  const results = [];
  for (const check of checks) {
    const full = path.resolve('scripts/ops', check.script);
    const res = await run(process.execPath, [full]);
    results.push({
      id: check.id,
      script: check.script,
      exit_code: res.code,
      stdout: res.stdout.slice(0, 4000),
      stderr: res.stderr.slice(0, 2000),
      passed: res.code === 0,
    });
  }
  const passed = results.every((r) => r.passed);
  const blockers = results.filter((r) => !r.passed).map((r) => `${r.id}:${r.script}`);
  const report = {
    checked_at: new Date().toISOString(),
    passed,
    blockers,
    results,
  };
  const out = writeReport('phase1-ops-freeze', report);
  console.log(JSON.stringify({ out, passed, blockers }));
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

