#!/usr/bin/env node
const http = require('http');
const { writeReport } = require('./common');

function get(pathname) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: 5000, path: pathname, method: 'GET', timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (d) => { body += String(d); });
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
    });
    req.on('error', (error) => resolve({ ok: false, status: 0, body: String(error.message || error) }));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.end();
  });
}

async function getWithRetry(pathname, attempts = 3) {
  let last = { ok: false, status: 0, body: 'not-run' };
  for (let i = 0; i < attempts; i += 1) {
    last = await get(pathname);
    if (last.ok) return last;
  }
  return last;
}

async function main() {
  const health = await getWithRetry('/health', 3);
  const apiHealth = await getWithRetry('/api/v1/health', 3);
  const report = {
    phase: '1E',
    checked_at: new Date().toISOString(),
    checks: {
      health,
      api_health: apiHealth,
    },
    passed: apiHealth.ok,
  };
  const out = writeReport('phase1-monitoring-observability', report);
  console.log(JSON.stringify({ out, ...report }));
  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
