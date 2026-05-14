#!/usr/bin/env node
const { spawn } = require('node:child_process');
const db = require('../config/database');

const API_BASE = process.env.LAYER3_API_BASE || 'http://127.0.0.1:5000';
const MANAGE_API = process.env.LAYER3G_MANAGE_API === '1';
const API_START_CMD = process.env.LAYER3G_API_START_CMD || 'npm run dev --workspace @carelearn/api';
const RESTART_DELAY_MS = Number(process.env.LAYER3G_RESTART_DELAY_MS || 5000);

function runShell(command, env = process.env, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: 'inherit', env, cwd });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function health() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`health failed ${res.status}`);
  const body = await res.json();
  if (body.status !== 'ok') throw new Error('health payload not ok');
}

async function assertPersistenceKeys() {
  const keys = [
    'layer2_ingestion_extraction_last',
  ];
  const result = await db.query(
    `SELECT key FROM organisation_settings WHERE key = ANY($1::text[])`,
    [keys]
  );
  const found = new Set(result.rows.map((r) => r.key));
  for (const key of keys) {
    if (!found.has(key)) throw new Error(`persistence key missing: ${key}`);
  }
}

async function main() {
  await health();
  await assertPersistenceKeys();

  await runShell('npm run validate:layer2b:auth-e2e --workspace @carelearn/api');
  await runShell('npm run validate:layer2c2g:e2e --workspace @carelearn/api');
  await runShell('node src/scripts/layer3e-performance-concurrency.js', process.env, 'apps/api');
  await runShell('node src/scripts/layer3f-security-audit-hardening.js', process.env, 'apps/api');

  if (MANAGE_API) {
    const api = spawn(API_START_CMD, { shell: true, stdio: 'inherit', env: process.env });
    await sleep(RESTART_DELAY_MS);
    await health();
    await assertPersistenceKeys();
    api.kill('SIGTERM');
  }

  console.log(`layer3g_freeze_ok ${JSON.stringify({ api_restart_checked: MANAGE_API })}`);
}

main().catch((error) => {
  console.error(`layer3g_freeze_fail ${error.message}`);
  process.exit(1);
});
