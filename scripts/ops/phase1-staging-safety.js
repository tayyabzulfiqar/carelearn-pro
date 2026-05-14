#!/usr/bin/env node
const path = require('path');
const { parseEnvFile, writeReport } = require('./common');

async function main() {
  const prodPath = path.resolve('.env.production');
  const stagingPath = path.resolve('.env.staging');
  const prod = parseEnvFile(prodPath);
  const staging = parseEnvFile(stagingPath);

  const report = {
    phase: '1F',
    checked_at: new Date().toISOString(),
    prod_env_exists: Object.keys(prod).length > 0,
    staging_env_exists: Object.keys(staging).length > 0,
    separation_checks: {},
    passed: false,
  };

  if (report.prod_env_exists && report.staging_env_exists) {
    report.separation_checks.db_url_diff = prod.DATABASE_URL !== staging.DATABASE_URL;
    report.separation_checks.jwt_secret_diff = prod.JWT_SECRET !== staging.JWT_SECRET;
    report.separation_checks.domain_diff = prod.DOMAIN !== staging.DOMAIN;
    report.passed = Object.values(report.separation_checks).every(Boolean);
  } else {
    report.blocker = 'Missing .env.staging or .env.production for isolation check';
  }

  const out = writeReport('phase1-staging-safety', report);
  console.log(JSON.stringify({ out, ...report }));
  process.exit(report.passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

