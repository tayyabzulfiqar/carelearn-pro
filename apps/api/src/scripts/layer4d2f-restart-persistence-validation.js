#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');

const API_BASE = process.env.LAYER4_API_BASE || process.env.LAYER3_API_BASE || 'http://127.0.0.1:5000';
const MANAGE_API = process.env.LAYER4_MANAGE_API === '1';
const API_START_CMD = process.env.LAYER4_API_START_CMD || 'npm run dev --workspace @carelearn/api';
const RESTART_DELAY_MS = Number(process.env.LAYER4_RESTART_DELAY_MS || 5000);

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNodeScript(scriptPath, env = process.env, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], { stdio: 'inherit', env, cwd });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${scriptPath} exited ${code}`));
    });
  });
}

async function health() {
  const res = await fetch(`${API_BASE}/health`);
  assertOk(res.ok, `health failed (${res.status})`);
  const data = await res.json();
  assertOk(data.status === 'ok', 'health payload not ok');
}

async function main() {
  await health();
  const cwd = process.cwd().replace(/\\/g, '/').endsWith('/apps/api')
    ? process.cwd()
    : path.join(process.cwd(), 'apps/api');
  await runNodeScript('src/scripts/layer4d-smart-runtime-validation.js', process.env, cwd);
  await runNodeScript('src/scripts/layer4e-analytics-recommendations-validation.js', process.env, cwd);
  await runNodeScript('src/scripts/layer4f-compliance-automation-validation.js', process.env, cwd);

  if (MANAGE_API) {
    const api = spawn(API_START_CMD, { shell: true, stdio: 'inherit', env: process.env });
    await sleep(RESTART_DELAY_MS);
    await health();
    await runNodeScript('src/scripts/layer4e-analytics-recommendations-validation.js', process.env, cwd);
    await runNodeScript('src/scripts/layer4f-compliance-automation-validation.js', process.env, cwd);
    api.kill('SIGTERM');
  }

  console.log(`layer4d2f_restart_persistence_ok ${JSON.stringify({ api_restart_checked: MANAGE_API })}`);
}

main().catch((error) => {
  console.error(`layer4d2f_restart_persistence_fail ${error.message}`);
  process.exit(1);
});
