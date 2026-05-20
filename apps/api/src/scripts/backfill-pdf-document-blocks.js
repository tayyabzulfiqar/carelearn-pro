const { randomUUID } = require('crypto');
const path = require('path');
const db = require('../config/database');
const { normalizeLessonDocument } = require('../lib/rich-content');

function looksLikePdfUrl(url = '') {
  return /\.pdf($|\?)/i.test(String(url || ''));
}

function inferFilename(url = '', fallback = 'Document.pdf') {
  try {
    const name = path.basename(String(url || '').split('?')[0] || '') || fallback;
    return name.toLowerCase().endsWith('.pdf') ? name : `${name}.pdf`;
  } catch (_err) {
    return fallback;
  }
}

function convertLegacyPdfBlocks(content = {}, title = '') {
  const normalized = normalizeLessonDocument({ title, content });
  const blocks = Array.isArray(normalized.blocks) ? normalized.blocks : [];
  const nextBlocks = [];
  const seenUrls = new Set();
  let converted = 0;

  for (const block of blocks) {
    if (block?.type === 'pdf_document') {
      const url = block?.payload?.url || block?.payload?.href || '';
      if (url) seenUrls.add(url);
      nextBlocks.push(block);
      continue;
    }

    const href = block?.payload?.href || '';
    const fileType = String(block?.payload?.fileType || '').toLowerCase();
    const isLegacyPdf = block?.type === 'file' && (fileType === 'pdf' || looksLikePdfUrl(href));

    if (isLegacyPdf) {
      const pdfUrl = href;
      if (pdfUrl && !seenUrls.has(pdfUrl)) {
        seenUrls.add(pdfUrl);
        nextBlocks.push({
          id: block.id || randomUUID(),
          type: 'pdf_document',
          order: nextBlocks.length,
          payload: {
            url: pdfUrl,
            filename: block?.payload?.label || inferFilename(pdfUrl),
            mimeType: 'application/pdf',
          },
          meta: block.meta || {},
        });
      }
      converted += 1;
      continue;
    }

    nextBlocks.push({ ...block, order: nextBlocks.length });
  }

  if (converted === 0) return { changed: false, converted: 0, nextContent: normalized };

  const nextContent = normalizeLessonDocument({
    title,
    content: {
      ...normalized,
      blocks: nextBlocks.map((block, index) => ({ ...block, order: index })),
    },
  });

  return { changed: true, converted, nextContent };
}

async function main() {
  const shouldWrite = process.argv.includes('--write');
  const lessonsResult = await db.query(
    `SELECT id, title, content
     FROM lessons
     WHERE content IS NOT NULL`
  );

  let scanned = 0;
  let changedLessons = 0;
  let convertedBlocks = 0;

  for (const lesson of lessonsResult.rows) {
    scanned += 1;
    const converted = convertLegacyPdfBlocks(lesson.content || {}, lesson.title || '');
    if (!converted.changed) continue;
    changedLessons += 1;
    convertedBlocks += converted.converted;

    if (shouldWrite) {
      await db.query(
        `UPDATE lessons
         SET content = $1, updated_at = NOW()
         WHERE id = $2`,
        [converted.nextContent, lesson.id]
      );
    }
  }

  console.log(JSON.stringify({
    mode: shouldWrite ? 'write' : 'dry-run',
    scanned_lessons: scanned,
    changed_lessons: changedLessons,
    converted_legacy_pdf_blocks: convertedBlocks,
  }, null, 2));
}

main()
  .catch((err) => {
    console.error('backfill-pdf-document-blocks failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await db.end();
    } catch (_err) {}
  });
