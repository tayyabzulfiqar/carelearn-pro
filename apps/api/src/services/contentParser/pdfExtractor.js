'use strict';

const pdfParse = require('pdf-parse');

async function extractTextFromPdf(buffer) {
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
