#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { Document, HeadingLevel, Packer, Paragraph } = require('docx');
const db = require('../config/database');

const API_BASE = process.env.LAYER3_API_BASE || 'http://127.0.0.1:5000';
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

async function postMultipart(url, parts, token, headers = {}) {
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
  return { status: res.status, data };
}

async function getJson(url, token, headers = {}) {
  const res = await fetch(url, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  });
  let data = {};
  try { data = await res.json(); } catch (_err) {}
  return { status: res.status, data };
}

async function createTrainingDocx(filePath, title, bodyLineA, bodyLineB, markerA, markerB) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
        new Paragraph(bodyLineA),
        new Paragraph(markerA),
        new Paragraph({ text: 'Operational Steps', heading: HeadingLevel.HEADING_2 }),
        new Paragraph(bodyLineB),
        new Paragraph(markerB),
      ],
    }],
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buf);
}

async function runSingleWorkflow({ token, headers, trainingName, docxPath, imageFiles }) {
  const created = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings`,
    { title: `${trainingName} ${randomUUID()}`, category: 'healthcare', status: 'draft' },
    token,
    headers
  );
  assertOk(created.status === 201, `${trainingName} create failed`);
  const trainingId = created.data?.data?.training?.id;
  assertOk(trainingId, `${trainingName} training id missing`);

  const extract = await postMultipart(
    `${API_BASE}/api/v1/admin/cms/ingestion/extract/validate`,
    [
      { name: 'document', value: new Blob([new Uint8Array(fs.readFileSync(docxPath))]), filename: path.basename(docxPath) },
      { name: 'imageFiles', value: JSON.stringify(imageFiles) },
      { name: 'trainingId', value: trainingId },
    ],
    token,
    headers
  );
  assertOk(extract.status === 200, `${trainingName} extraction failed`);

  const preview = await postJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/preview/load-latest`, {}, token, headers);
  assertOk(preview.status === 200, `${trainingName} preview load failed`);

  const approve = await postJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/approval`, { action: 'approved' }, token, headers);
  assertOk(approve.status === 200, `${trainingName} approval failed`);

  const publish = await postJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/publish`, {}, token, headers);
  assertOk(publish.status === 200, `${trainingName} publish failed`);

  const runtime = await getJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/published-runtime`, token, headers);
  assertOk(runtime.status === 200, `${trainingName} runtime fetch failed`);
  assertOk(runtime.data?.data?.runtime?.render?.lessonBlocks?.length > 0, `${trainingName} learner runtime empty`);

  const history = await getJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/publish-history`, token, headers);
  assertOk(history.status === 200, `${trainingName} publish history failed`);
  assertOk(Array.isArray(history.data?.data?.publish_history?.events), `${trainingName} history events missing`);

  return trainingId;
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing admin credentials');
  const login = await postJson(`${API_BASE}/api/v1/auth/login`, { email: LOGIN_EMAIL, password: LOGIN_PASSWORD });
  assertOk(login.status === 200 && login.data?.token, 'login failed');
  const token = login.data.token;

  const orgRow = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(orgRow.rows.length > 0, 'no organisation found');
  const orgId = orgRow.rows[0].id;
  const headers = { 'x-org-id': orgId };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer3a-real-'));
  const fireDocx = path.join(tmpDir, 'fire-safety.docx');
  const dementiaDocx = path.join(tmpDir, 'dementia.docx');
  const blsDocx = path.join(tmpDir, 'bls.docx');

  await createTrainingDocx(
    fireDocx,
    'Fire Safety Awareness',
    'Prevent and respond to healthcare site fire risks.',
    'Escalation and evacuation actions by role.',
    '[IMAGE_1_RIGHT]',
    '[IMAGE_2_CENTER]'
  );
  await createTrainingDocx(
    dementiaDocx,
    'Dementia Care Awareness',
    'Communication and person-centered care routines.',
    'Escalation protocols and safeguarding checks.',
    '[IMAGE_1_LEFT]',
    '[IMAGE_2_CENTER]'
  );
  await createTrainingDocx(
    blsDocx,
    'Basic Life Support (BLS)',
    'Immediate response chain for cardiac and respiratory events.',
    'CPR cycle, AED readiness, and handover standards.',
    '[IMAGE_1_RIGHT]',
    '[IMAGE_2_LEFT]'
  );

  const createdIds = [];
  createdIds.push(await runSingleWorkflow({
    token,
    headers,
    trainingName: 'Fire Safety',
    docxPath: fireDocx,
    imageFiles: ['IMAGE_1.jpg', 'IMAGE_2.jpg'],
  }));
  createdIds.push(await runSingleWorkflow({
    token,
    headers,
    trainingName: 'Dementia',
    docxPath: dementiaDocx,
    imageFiles: ['IMAGE_1.jpg', 'IMAGE_2.jpg'],
  }));
  createdIds.push(await runSingleWorkflow({
    token,
    headers,
    trainingName: 'BLS',
    docxPath: blsDocx,
    imageFiles: ['IMAGE_1.jpg', 'IMAGE_2.jpg'],
  }));

  const diagnostics = await getJson(`${API_BASE}/api/v1/admin/cms/ingestion/diagnostics`, token, headers);
  assertOk(diagnostics.status === 200, 'diagnostics endpoint failed');
  assertOk(diagnostics.data?.data?.diagnostics?.counters?.total > 0, 'diagnostics counters missing');

  console.log(`layer3a_real_training_workflow_e2e: ok trainings=${createdIds.join(',')}`);
}

main().catch((error) => {
  console.error(`layer3a_real_training_workflow_e2e_fail ${error.message}`);
  process.exit(1);
});

