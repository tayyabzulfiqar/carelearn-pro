#!/usr/bin/env node
const http = require('node:http');

const host = process.env.API_HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.API_PORT || 5000);
const path = process.env.HEALTH_PATH || '/health';

function getJson(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path: urlPath, method: 'GET', timeout: 8000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );
    req.on('timeout', () => req.destroy(new Error(`Timeout calling ${urlPath}`)));
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const result = await getJson(path);
  if (result.statusCode !== 200) {
    throw new Error(`Health check failed: HTTP ${result.statusCode} body=${result.body}`);
  }
  const parsed = JSON.parse(result.body);
  if (parsed.status !== 'ok') {
    throw new Error(`Health payload invalid: ${result.body}`);
  }
  console.log(`health_ok ${host}:${port}${path}`);
}

main().catch((err) => {
  console.error(`health_fail ${err.message}`);
  process.exit(1);
});
