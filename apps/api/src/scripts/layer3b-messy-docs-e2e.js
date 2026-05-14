#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Document, HeadingLevel, Packer, Paragraph } = require('docx');
const { PDFDocument, StandardFonts } = require('pdf-lib');
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

async function createLongDocx(filePath) {
  const children = [new Paragraph({ text: '## Long Care Protocol', heading: HeadingLevel.HEADING_1 })];
  for (let i = 1; i <= 80; i += 1) {
    children.push(new Paragraph(`Paragraph ${i}: deterministic long-form content for ingestion stability.`));
  }
  children.push(new Paragraph('[IMAGE_1_RIGHT]'));
  children.push(new Paragraph({ text: '## Extended Section', heading: HeadingLevel.HEADING_2 }));
  for (let i = 81; i <= 160; i += 1) {
    children.push(new Paragraph(`Paragraph ${i}: deterministic long-form content for render and section stability.`));
  }
  children.push(new Paragraph('[IMAGE_2_CENTER]'));
  const doc = new Document({ sections: [{ children }] });
  fs.writeFileSync(filePath, await Packer.toBuffer(doc));
}

async function createBrokenMarkerDocx(filePath) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: '## NHS Export Style', heading: HeadingLevel.HEADING_1 }),
        new Paragraph('Content line with uneven spacing        and tabs\t\tkept as-is.'),
        new Paragraph('[IMAGE_1_MIDDLE]'),
      ],
    }],
  });
  fs.writeFileSync(filePath, await Packer.toBuffer(doc));
}

async function createValidPdf(filePath) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let y = 800;
  const lines = [
    '## Medication Safety',
    'Real-world spacing   remains deterministic.',
    '[IMAGE_1_LEFT]',
    '## Storage',
    'Cold chain and lock policy.',
    '[IMAGE_2_RIGHT]',
  ];
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 20;
  }
  fs.writeFileSync(filePath, Buffer.from(await pdfDoc.save()));
}

function createAmbiguousPdfRaw(filePath) {
  const content = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    '(## Fire Safety) Tj',
    '0 -20 Td',
    '<FEFF004200610064001B00200067006C007900700068> Tj',
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
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  fs.writeFileSync(filePath, Buffer.from(pdf, 'binary'));
}

async function main() {
  assertOk(LOGIN_EMAIL && LOGIN_PASSWORD, 'Missing admin credentials');
  const login = await postJson(`${API_BASE}/api/v1/auth/login`, { email: LOGIN_EMAIL, password: LOGIN_PASSWORD });
  assertOk(login.status === 200 && login.data?.token, 'login failed');
  const token = login.data.token;
  const orgRow = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  assertOk(orgRow.rows.length > 0, 'no organisation found');
  const headers = { 'x-org-id': orgRow.rows[0].id };

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer3b-messy-'));
  const longDocx = path.join(tmpDir, 'long.docx');
  const badMarkerDocx = path.join(tmpDir, 'bad-marker.docx');
  const validPdf = path.join(tmpDir, 'valid.pdf');
  const ambiguousPdf = path.join(tmpDir, 'ambiguous.pdf');
  const malformedPdf = path.join(tmpDir, 'malformed.pdf');

  await createLongDocx(longDocx);
  await createBrokenMarkerDocx(badMarkerDocx);
  await createValidPdf(validPdf);
  createAmbiguousPdfRaw(ambiguousPdf);
  fs.writeFileSync(malformedPdf, Buffer.from('not-a-real-pdf'));

  const endpoint = `${API_BASE}/api/v1/admin/cms/ingestion/extract/validate`;
  async function upload(file, imageFiles) {
    return postMultipart(endpoint, [
      { name: 'document', value: new Blob([new Uint8Array(fs.readFileSync(file))]), filename: path.basename(file) },
      { name: 'imageFiles', value: JSON.stringify(imageFiles || []) },
    ], token, headers);
  }

  const passLong = await upload(longDocx, ['IMAGE_1.jpg', 'IMAGE_2.jpg']);
  assertOk(passLong.status === 200, `long DOCX expected pass; got ${passLong.status}`);

  const failBrokenMarker = await upload(badMarkerDocx, ['IMAGE_1.jpg']);
  assertOk(failBrokenMarker.status === 422, `broken marker expected 422; got ${failBrokenMarker.status}`);

  const passPdf = await upload(validPdf, ['IMAGE_1.jpg', 'IMAGE_2.jpg']);
  assertOk(passPdf.status === 200, `valid PDF expected pass; got ${passPdf.status}`);

  const failAmbiguous = await upload(ambiguousPdf, ['IMAGE_1.jpg']);
  assertOk(failAmbiguous.status === 422, `ambiguous PDF expected 422; got ${failAmbiguous.status}`);

  const failMalformed = await upload(malformedPdf, []);
  assertOk(failMalformed.status === 422, `malformed PDF expected 422; got ${failMalformed.status}`);

  const diagnostics = await fetch(`${API_BASE}/api/v1/admin/cms/ingestion/diagnostics`, {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  });
  assertOk(diagnostics.status === 200, 'diagnostics endpoint failed');

  console.log('layer3b_messy_docs_e2e: ok');
}

main().catch((error) => {
  console.error(`layer3b_messy_docs_e2e_fail ${error.message}`);
  process.exit(1);
});

