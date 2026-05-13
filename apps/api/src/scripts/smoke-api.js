#!/usr/bin/env node
const http = require('node:http');

const host = process.env.API_HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.API_PORT || 5000);

function request(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path, method: 'GET', timeout: 8000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );
    req.on('timeout', () => req.destroy(new Error(`Timeout on ${path}`)));
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const checks = ['/health', '/api/v1/health'];
  for (const path of checks) {
    const result = await request(path);
    if (result.statusCode !== 200) {
      throw new Error(`Smoke failed ${path}: HTTP ${result.statusCode}`);
    }
  }
  console.log(`smoke_ok ${host}:${port}`);
}

main().catch((err) => {
  console.error(`smoke_fail ${err.message}`);
  process.exit(1);
});
