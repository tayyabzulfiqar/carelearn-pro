#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { Document, HeadingLevel, Packer, Paragraph } = require('docx');
const db = require('../config/database');

const API_BASE = process.env.LAYER2B_API_BASE || 'http://127.0.0.1:5000';
const LOGIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const LOGIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(url, body, token, headers = {}) {
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
  return { status: res.status, data };
}

async function getJson(url, token, headers = {}) {
  const res = await fetch(url, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  let data = {};
  try { data = await res.json(); } catch (_err) {}
  return { status: res.status, data };
}

async function postMultipart(url, parts, token, extraHeaders = {}) {
  const form = new FormData();
  for (const part of parts) {
    if (part.filename) form.append(part.name, part.value, part.filename);
    else form.append(part.name, part.value);
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: form,
  });
  let data = {};
  try { data = await res.json(); } catch (_err) {}
  return { status: res.status, data };
}

async function createDocx(filePath) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Fire Safety Awareness', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Intro paragraph for healthcare training.'),
        new Paragraph('[IMAGE_1_RIGHT]'),
        new Paragraph({ text: 'Hazards', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Hazard details and mitigation actions.'),
        new Paragraph('[IMAGE_2_CENTER]'),
      ],
    }],
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buf);
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing admin credentials');
  const login = await postJson(`${API_BASE}/api/v1/auth/login`, { email: LOGIN_EMAIL, password: LOGIN_PASSWORD });
  assertOk(login.status === 200 && login.data?.token, 'login failed');
  const token = login.data.token;

  const orgRow = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(orgRow.rows.length > 0, 'no organisation');
  const orgId = orgRow.rows[0].id;
  const headers = { 'x-org-id': orgId };

  const training = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings`,
    { title: `Layer2C2G ${randomUUID()}`, category: 'general', status: 'draft' },
    token,
    headers
  );
  assertOk(training.status === 201, 'create training failed');
  const trainingId = training.data?.data?.training?.id;
  assertOk(trainingId, 'training id missing');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer2c2g-'));
  const docxPath = path.join(tmpDir, 'valid.docx');
  await createDocx(docxPath);
  const extractionEndpoint = `${API_BASE}/api/v1/admin/cms/ingestion/extract/validate`;
  const extract = await postMultipart(extractionEndpoint, [
    { name: 'document', value: new Blob([new Uint8Array(fs.readFileSync(docxPath))]), filename: 'valid.docx' },
    { name: 'imageFiles', value: JSON.stringify(['IMAGE_1.jpg', 'IMAGE_2.jpg']) },
  ], token, headers);
  assertOk(extract.status === 200, 'extraction failed');

  const loadPreview = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/preview/load-latest`,
    {},
    token,
    headers
  );
  assertOk(loadPreview.status === 200, 'preview load failed');
  assertOk(loadPreview.data?.data?.preview?.render?.html, 'preview render html missing');

  const approve = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/approval`,
    { action: 'approved' },
    token,
    headers
  );
  assertOk(approve.status === 200, 'approval failed');
  assertOk(approve.data?.data?.preview?.state === 'approved', 'approval state missing');

  const publish = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/publish`,
    {},
    token,
    headers
  );
  assertOk(publish.status === 200, 'publish failed');
  assertOk(publish.data?.data?.snapshot?.published_at, 'publish timestamp missing');

  const runtime = await getJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/published-runtime`, token, headers);
  assertOk(runtime.status === 200, 'published runtime fetch failed');
  assertOk(runtime.data?.data?.runtime?.render?.lessonBlocks?.length > 0, 'runtime render blocks missing');

  const reject = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/approval`,
    { action: 'rejected', reason: 'quality gate' },
    token,
    headers
  );
  assertOk(reject.status === 200, 'rejection persistence failed');
  assertOk(reject.data?.data?.preview?.approval?.reason === 'quality gate', 'rejection reason not persisted');

  const draftStatus = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/status`,
    { status: 'draft' },
    token,
    headers
  );
  assertOk(draftStatus.status === 200, 'draft transition failed');

  const blockedPublishViaStatus = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/status`,
    { status: 'published' },
    token,
    headers
  );
  assertOk(blockedPublishViaStatus.status === 422, 'published status bypass should fail');

  const persistedWorkflow = await db.query(
    `SELECT value FROM organisation_settings WHERE organisation_id = $1 AND key = $2 LIMIT 1`,
    [orgId, `layer2_publish_workflow_${trainingId}`]
  );
  assertOk(persistedWorkflow.rows.length === 1, 'workflow persistence missing');

  const persistedSnapshot = await db.query(
    `SELECT value FROM organisation_settings WHERE organisation_id = $1 AND key = $2 LIMIT 1`,
    [orgId, `layer2_publish_snapshot_${trainingId}`]
  );
  assertOk(persistedSnapshot.rows.length === 1, 'snapshot persistence missing');

  console.log('layer2c2g_publish_e2e: ok');
}

main().catch((error) => {
  console.error(`layer2c2g_publish_e2e_fail ${error.message}`);
  process.exit(1);
});

