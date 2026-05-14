#!/usr/bin/env node
const { randomUUID } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Document, HeadingLevel, Packer, Paragraph } = require('docx');
const db = require('../config/database');

const API_BASE = process.env.LAYER4_API_BASE || 'http://127.0.0.1:5000';
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

async function createDocx(filePath) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Fire Safety Awareness', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Always check exits before starting a shift.'),
        new Paragraph('Never block fire doors in a care facility.'),
        new Paragraph({ text: 'Response', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Report smoke immediately to the senior carer.'),
        new Paragraph('Follow local compliance policy and safety protocols.'),
      ],
    }],
  });
  fs.writeFileSync(filePath, await Packer.toBuffer(doc));
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

async function ensurePublishedTraining({ token, headers }) {
  const created = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings`,
    { title: `Layer4 AI ${randomUUID()}`, category: 'general', status: 'draft' },
    token,
    headers
  );
  assertOk(created.status === 201, 'failed to create training');
  const trainingId = created.data?.data?.training?.id;
  assertOk(trainingId, 'missing training id');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer4a4c-'));
  const docxPath = path.join(tmpDir, 'layer4.docx');
  await createDocx(docxPath);
  const extract = await postMultipart(
    `${API_BASE}/api/v1/admin/cms/ingestion/extract/validate`,
    [
      { name: 'document', value: new Blob([new Uint8Array(fs.readFileSync(docxPath))]), filename: 'layer4.docx' },
      { name: 'imageFiles', value: JSON.stringify([]) },
    ],
    token,
    headers
  );
  assertOk(extract.status === 200, 'deterministic extraction failed');

  const preview = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/preview/load-latest`,
    {},
    token,
    headers
  );
  assertOk(preview.status === 200, 'preview load failed');

  const approve = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/approval`,
    { action: 'approved' },
    token,
    headers
  );
  assertOk(approve.status === 200, 'approval failed');

  const publish = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/publish`,
    {},
    token,
    headers
  );
  assertOk(publish.status === 200, 'publish failed');
  return trainingId;
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

  const trainingId = await ensurePublishedTraining({ token, headers });

  const quizGen = await postJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/ai/quiz/generate`, {}, token, headers);
  assertOk(quizGen.status === 200, `quiz generation failed status=${quizGen.status} code=${quizGen.data?.error || ''} message=${quizGen.data?.message || ''}`);
  assertOk((quizGen.data?.data?.quiz?.questions || []).length >= 4, 'quiz question count invalid');

  const quizScore = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/ai/quiz/score`,
    { answers: [0, 1, 0, 0], learner_id: randomUUID() },
    token,
    headers
  );
  assertOk(quizScore.status === 200, 'quiz score failed');
  assertOk(typeof quizScore.data?.data?.attempt?.score === 'number', 'quiz score missing');

  const summaryGen = await postJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/ai/summary/generate`, {}, token, headers);
  assertOk(summaryGen.status === 200, 'summary generation failed');
  assertOk((summaryGen.data?.data?.summary?.key_points || []).length > 0, 'summary key points missing');

  const narrationGen = await postJson(
    `${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/ai/narration/generate`,
    { language: 'en-GB' },
    token,
    headers
  );
  assertOk(narrationGen.status === 200, 'narration generation failed');
  assertOk((narrationGen.data?.data?.narration?.sections || []).length > 0, 'narration sections missing');

  const summaryGet = await getJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/ai/summary`, token, headers);
  const narrationGet = await getJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/ai/narration`, token, headers);
  const quizGet = await getJson(`${API_BASE}/api/v1/admin/cms/trainings/${trainingId}/ai/quiz`, token, headers);
  assertOk(summaryGet.status === 200 && narrationGet.status === 200 && quizGet.status === 200, 'ai get endpoints failed');

  const persisted = await db.query(
    `SELECT key FROM organisation_settings
     WHERE organisation_id = $1
       AND key IN ($2, $3, $4)`,
    [orgId, `layer4_ai_quiz_${trainingId}`, `layer4_ai_summary_${trainingId}`, `layer4_ai_narration_${trainingId}`]
  );
  assertOk(persisted.rows.length === 3, 'layer4 ai persistence incomplete');

  console.log('layer4a4c_ai_e2e: ok');
}

main().catch((error) => {
  console.error(`layer4a4c_ai_e2e_fail ${error.message}`);
  process.exit(1);
});
