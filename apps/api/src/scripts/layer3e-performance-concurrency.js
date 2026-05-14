#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { performance } = require('perf_hooks');
const { Document, HeadingLevel, Packer, Paragraph } = require('docx');
require('dotenv').config();
const db = require('../config/database');

const API_BASE = process.env.LAYER3_API_BASE || 'http://127.0.0.1:5000';
const LOGIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const LOGIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const CONCURRENCY = Math.max(1, Number(process.env.LAYER3E_CONCURRENCY || 4));
const ITERATIONS = Math.max(1, Number(process.env.LAYER3E_ITERATIONS || 8));

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(url, body, token, headers = {}) {
  const t0 = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch (_err) {}
  return { status: res.status, data, ms: Number((performance.now() - t0).toFixed(2)) };
}

async function postMultipart(url, parts, token, headers = {}) {
  const t0 = performance.now();
  const form = new FormData();
  for (const part of parts) {
    if (part.filename) form.append(part.name, part.value, part.filename);
    else form.append(part.name, part.value);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: form,
  });

  let data = {};
  try { data = await res.json(); } catch (_err) {}
  return { status: res.status, data, ms: Number((performance.now() - t0).toFixed(2)) };
}

async function createDocxBuffer(label) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: `## Fire Safety ${label}`, heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Deterministic load validation paragraph.'),
        new Paragraph('[IMAGE_1_CENTER]'),
        new Paragraph({ text: '## Evacuation', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Evacuation protocol validation paragraph.'),
      ],
    }],
  });
  return Packer.toBuffer(doc);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function runJob(index, token, headers) {
  const docBuffer = await createDocxBuffer(index);
  const extraction = await postMultipart(
    `${API_BASE}/api/v1/admin/cms/ingestion/extract/validate`,
    [
      { name: 'document', value: new Blob([new Uint8Array(docBuffer)]), filename: `layer3e-${index}.docx` },
      { name: 'imageFiles', value: JSON.stringify(['IMAGE_1.jpg']) },
    ],
    token,
    headers
  );
  assertOk(extraction.status === 200, `extract failed at job ${index}`);

  return {
    extractMs: extraction.ms,
  };
}

async function runPool(total, concurrency, worker) {
  const tasks = Array.from({ length: total }, (_, i) => i);
  const out = [];
  let cursor = 0;

  async function take() {
    while (cursor < tasks.length) {
      const i = cursor;
      cursor += 1;
      out[i] = await worker(tasks[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => take()));
  return out;
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD');

  const login = await postJson(`${API_BASE}/api/v1/auth/login`, { email: LOGIN_EMAIL, password: LOGIN_PASSWORD });
  assertOk(login.status === 200 && login.data?.token, 'login failed');
  const token = login.data.token;

  const orgRow = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(orgRow.rows.length > 0, 'no organisation found');
  const orgHeaders = { 'x-org-id': orgRow.rows[0].id };

  const results = await runPool(ITERATIONS, CONCURRENCY, (i) => runJob(i + 1, token, orgHeaders));

  const extractLat = results.map((r) => r.extractMs);
  const totalOps = ITERATIONS;

  const summary = {
    iterations: ITERATIONS,
    concurrency: CONCURRENCY,
    total_operations: totalOps,
    extract_ms_p50: percentile(extractLat, 50),
    extract_ms_p95: percentile(extractLat, 95),
  };

  const outDir = path.join(process.cwd(), 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'layer3e-performance-summary.json');
  fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}${os.EOL}`);

  console.log(`layer3e_performance_ok ${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(`layer3e_performance_fail ${error.message}`);
  process.exit(1);
});
