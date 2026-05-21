'use strict';

const pdfParse = require('pdf-parse');

async function extractTextFromPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('Invalid PDF buffer');
  }
  const result = await pdfParse(buffer);
  return String(result?.text || '').trim();
}

module.exports = { extractTextFromPdf };
