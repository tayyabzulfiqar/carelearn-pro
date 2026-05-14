#!/usr/bin/env node
const path = require('path');
const { parseEnvFile, writeReport } = require('./common');

const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_EXPIRES',
  'CORS_ORIGIN',
  'NEXT_PUBLIC_API_URL',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'DOMAIN',
];

function hasLocalhost(value) {
  const v = String(value || '').toLowerCase();
  return v.includes('localhost') || v.includes('127.0.0.1');
}

async function main() {
  const envPath = path.resolve('.env.production');
  const env = parseEnvFile(envPath);
  const missing = required.filter((k) => !env[k]);
  const localhostKeys = Object.entries(env).filter(([, v]) => hasLocalhost(v)).map(([k]) => k);
  const jwtWeak = !env.JWT_SECRET || String(env.JWT_SECRET).length < 24;
  const passed = missing.length === 0 && localhostKeys.length === 0 && !jwtWeak;

  const report = {
    phase: '1C',
    env_file: envPath,
    passed,
    missing,
    localhost_keys: localhostKeys,
    jwt_secret_weak: jwtWeak,
    checked_at: new Date().toISOString(),
  };
  const out = writeReport('phase1-env-governance', report);
  console.log(JSON.stringify({ out, ...report }));
  process.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

