'use strict';

async function extractTextFromPdf(buffer) {
  // lazy-load to prevent startup crash when pdf-parse loads test fixtures at require time
  const pdfParse = require('pdf-parse');
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { success: false, text: null };
  }
  try {
    const result = await pdfParse(buffer);
    const text = String(result?.text || '').trim();
    return { success: true, text };
  } catch {
    return { success: false, text: null };
  }
}

module.exports = { extractTextFromPdf };
