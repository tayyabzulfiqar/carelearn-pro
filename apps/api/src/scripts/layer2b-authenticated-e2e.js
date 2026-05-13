#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');
const { Document, HeadingLevel, Packer, Paragraph } = require('docx');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const db = require('../config/database');

const API_BASE = process.env.LAYER2B_API_BASE || 'http://127.0.0.1:5000';
const LOGIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const LOGIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function postJson(url, body, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await res.json(); } catch (_err) {}
  return { status: res.status, data };
}

async function postMultipart(url, parts, token, extraHeaders = {}) {
  const form = new FormData();
  for (const part of parts) {
    if (part.filename) {
      form.append(part.name, part.value, part.filename);
    } else {
      form.append(part.name, part.value);
    }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: form,
  });
  let data = {};
  try { data = await res.json(); } catch (_err) {}
  return { status: res.status, data };
}

async function createDocx(filePath, opts = {}) {
  const title = opts.title || 'Fire Safety Awareness';
  const doc = new Document({
    sections: [{
      children: [
        ...(opts.preface ? [new Paragraph(opts.preface)] : []),
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Intro paragraph for healthcare training.'),
        new Paragraph('[IMAGE_1_RIGHT]'),
        new Paragraph({ text: 'Hazards', heading: HeadingLevel.HEADING_2 }),
        new Paragraph(opts.hazardsText || 'Hazard details and mitigation actions.'),
        new Paragraph(opts.secondMarker || '[IMAGE_2_CENTER]'),
      ],
    }],
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buf);
}

async function createPdf(filePath, lines) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = 800;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 20;
  }
  const bytes = await pdfDoc.save();
  fs.writeFileSync(filePath, Buffer.from(bytes));
}

function createAmbiguousPdfRaw(filePath) {
  const content = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    '(## Fire Safety) Tj',
    '0 -20 Td',
    '(Bad \\000 glyph) Tj',
    'ET',
  ].join('\n');

  const objects = [];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj');
  objects.push(`4 0 obj << /Length ${Buffer.byteLength(content, 'binary')} >> stream\n${content}\nendstream endobj`);
  objects.push('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${obj}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  fs.writeFileSync(filePath, Buffer.from(pdf, 'binary'));
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD');
  assertOk(JWT_SECRET, 'Missing JWT_SECRET');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer2b-e2e-'));
  const validDocx = path.join(tmpDir, 'valid.docx');
  const prefaceDocx = path.join(tmpDir, 'preface.docx');
  const dupMarkerDocx = path.join(tmpDir, 'dup.docx');
  const validPdf = path.join(tmpDir, 'valid.pdf');
  const noHeadingPdf = path.join(tmpDir, 'noheading.pdf');
  const ocrPdf = path.join(tmpDir, 'ocr.pdf');

  await createDocx(validDocx);
  await createDocx(prefaceDocx, { preface: 'Preface content before first heading' });
  await createDocx(dupMarkerDocx, { secondMarker: '[IMAGE_1_LEFT]' });

  await createPdf(validPdf, [
    '## Fire Safety Awareness',
    'Intro paragraph for healthcare training.',
    '[IMAGE_1_RIGHT]',
    '## Hazards',
    'Hazard details.',
    '[IMAGE_2_CENTER]',
  ]);
  await createPdf(noHeadingPdf, ['Fire Safety Awareness', 'No explicit headings']);
  createAmbiguousPdfRaw(ocrPdf);

  const login = await postJson(`${API_BASE}/api/v1/auth/login`, {
    email: LOGIN_EMAIL,
    password: LOGIN_PASSWORD,
  });
  assertOk(login.status === 200 && login.data?.token, 'super_admin login failed');
  const token = login.data.token;

  const me = await fetch(`${API_BASE}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertOk(me.status === 200, '/auth/me failed');

  const orgRow = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(orgRow.rows.length > 0, 'No organisation found for persistence check');
  const orgId = orgRow.rows[0].id;

  const endpoint = `${API_BASE}/api/v1/admin/cms/ingestion/extract/validate`;
  const commonHeaderToken = token;
  const orgHeaders = { 'x-org-id': orgId };

  async function callFile(filePath, imageFiles) {
    return postMultipart(endpoint, [
      { name: 'document', value: new Blob([new Uint8Array(fs.readFileSync(filePath))]), filename: path.basename(filePath) },
      { name: 'imageFiles', value: JSON.stringify(imageFiles || []) },
    ], commonHeaderToken, orgHeaders);
  }

  const okDocx = await callFile(validDocx, ['IMAGE_1.jpg', 'IMAGE_2.png']);
  assertOk(okDocx.status === 200, `valid DOCX failed (${okDocx.status})`);
  assertOk(okDocx.data?.data?.extraction?.canonical?.sections?.length >= 1, 'valid DOCX canonical missing');

  const okPdf = await callFile(validPdf, ['IMAGE_1.jpg', 'IMAGE_2.jpg']);
  assertOk(okPdf.status === 200, `valid PDF failed (${okPdf.status})`);
  assertOk(okPdf.data?.data?.extraction?.canonical?.sections?.length >= 1, 'valid PDF canonical missing');

  const persisted = await db.query(
    `SELECT value FROM organisation_settings
     WHERE organisation_id = $1 AND key = 'layer2_ingestion_extraction_last'
     LIMIT 1`,
    [orgId]
  );
  assertOk(persisted.rows.length === 1, 'extraction persistence missing');
  assertOk(Boolean(persisted.rows[0].value?.canonical), 'persisted canonical missing');

  const malformedDocx = await postMultipart(endpoint, [
    { name: 'document', value: new Blob([new Uint8Array(Buffer.from('broken-docx'))]), filename: 'broken.docx' },
  ], commonHeaderToken, orgHeaders);
  assertOk(malformedDocx.status === 422, 'malformed DOCX did not fail 422');

  const malformedPdf = await postMultipart(endpoint, [
    { name: 'document', value: new Blob([new Uint8Array(Buffer.from('broken-pdf'))]), filename: 'broken.pdf' },
  ], commonHeaderToken, orgHeaders);
  assertOk(malformedPdf.status === 422, 'malformed PDF did not fail 422');

  const duplicateMarker = await callFile(dupMarkerDocx, ['IMAGE_1.jpg']);
  assertOk(duplicateMarker.status === 422, 'duplicate markers did not fail 422');

  const missingImageMapping = await callFile(validDocx, ['IMAGE_1.jpg']);
  assertOk(missingImageMapping.status === 422, 'missing image mapping did not fail 422');

  const preHeadingContent = await callFile(prefaceDocx, ['IMAGE_1.jpg', 'IMAGE_2.jpg']);
  assertOk(preHeadingContent.status === 422, 'content before heading did not fail 422');

  const ocrAmbiguous = await callFile(ocrPdf, ['IMAGE_1.jpg']);
  assertOk(ocrAmbiguous.status === 422, 'OCR ambiguity did not fail 422');

  const invalidHeadingStructure = await callFile(noHeadingPdf, []);
  assertOk(invalidHeadingStructure.status === 422, 'invalid heading structure did not fail 422');

  const badMultipart = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${commonHeaderToken}`,
      'Content-Type': 'application/json',
      'x-org-id': orgId,
    },
    body: JSON.stringify({ nope: true }),
  });
  assertOk(badMultipart.status === 400, 'malformed multipart did not fail 400');

  const unauthorized = await fetch(endpoint, { method: 'POST' });
  assertOk(unauthorized.status === 401, 'unauthorized request did not fail 401');

  const invalidJwt = await postMultipart(endpoint, [
    { name: 'document', value: new Blob([new Uint8Array(fs.readFileSync(validDocx))]), filename: 'valid.docx' },
  ], 'invalid.token.value', orgHeaders);
  assertOk(invalidJwt.status === 401, 'invalid JWT did not fail 401');

  const expired = jwt.sign(
    { id: login.data.user.id, email: login.data.user.email, role: 'super_admin' },
    JWT_SECRET,
    { expiresIn: '-1s' }
  );
  const expiredJwt = await postMultipart(endpoint, [
    { name: 'document', value: new Blob([new Uint8Array(fs.readFileSync(validDocx))]), filename: 'valid.docx' },
  ], expired, orgHeaders);
  assertOk(expiredJwt.status === 401, 'expired JWT did not fail 401');

  console.log('layer2b_auth_e2e: ok');
}

main().catch((error) => {
  console.error(`layer2b_auth_e2e_fail ${error.message}`);
  process.exit(1);
});
