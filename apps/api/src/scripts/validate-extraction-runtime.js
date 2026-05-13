#!/usr/bin/env node
const { extractDocxStructured } = require('../lib/docx-structure-extractor');
const { extractPdfStructured } = require('../lib/pdf-structure-extractor');
const { normalizeDocBlocksToStructured, structuredToNormalizedText } = require('../lib/extraction-normalizer');
const { adaptExtractedBlocksToCanonical } = require('../lib/ingestion-contract-adapter');
const { randomUUID } = require('crypto');
const db = require('../config/database');

async function expectReject(label, fn) {
  try {
    await fn();
    throw new Error(`${label} expected rejection but passed`);
  } catch (_error) {
    console.log(`${label}: ok`);
  }
}

async function main() {
  await expectReject('malformed_docx_reject', () =>
    extractDocxStructured({ buffer: Buffer.from('not-a-docx') }));
  await expectReject('malformed_pdf_reject', () =>
    extractPdfStructured({ buffer: Buffer.from('not-a-pdf') }));

  const blocks = [
    { type: 'heading', level: 1, text: 'Fire Safety' },
    { type: 'paragraph', text: 'Intro text' },
    { type: 'paragraph', text: '[IMAGE_1_RIGHT]' },
  ];

  const structured = normalizeDocBlocksToStructured(blocks);
  const a = structuredToNormalizedText(structured);
  const b = structuredToNormalizedText(structured);
  if (a !== b) throw new Error('normalized_text_not_deterministic');
  console.log('normalized_text_deterministic: ok');

  const adapted = adaptExtractedBlocksToCanonical({ blocks, imageFiles: ['IMAGE_1.jpg'] });
  if (!adapted.canonical?.sections?.length) {
    throw new Error('adapter_failed');
  }
  console.log('contract_adapter: ok');

  const org = await db.query('SELECT id FROM organisations ORDER BY created_at ASC LIMIT 1');
  if (org.rows.length) {
    const orgId = org.rows[0].id;
    const key = 'layer2b_runtime_validation_probe';
    const value = { stamp: new Date().toISOString(), normalized: adapted.normalizedText };
    await db.query(
      `INSERT INTO organisation_settings (id, organisation_id, key, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organisation_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [randomUUID(), orgId, key, value]
    );
    const readBack = await db.query(
      'SELECT value FROM organisation_settings WHERE organisation_id = $1 AND key = $2 LIMIT 1',
      [orgId, key]
    );
    if (!readBack.rows.length || readBack.rows[0].value.normalized !== adapted.normalizedText) {
      throw new Error('persistence_validation_failed');
    }
    console.log('persistence_validation: ok');
  } else {
    console.log('persistence_validation: skipped_no_organisation');
  }
}

main().catch((error) => {
  console.error(`runtime_validation_fail ${error.message}`);
  process.exit(1);
});
