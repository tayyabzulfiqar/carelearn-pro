let cachedPdfjsPromise = null;

async function getPdfjs() {
  if (!cachedPdfjsPromise) {
    cachedPdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  }
  return cachedPdfjsPromise;
}

function parseStrictPdfTextToBlocks(rawText) {
  const lines = String(rawText || '').replace(/\r/g, '').split('\n').map((line) => line.trimEnd());
  const blocks = [];
  for (const line of lines) {
    const text = line.trim();
    if (!text) continue;
    if (/[\uFFFD]/.test(text)) {
      const err = new Error('PDF_OCR_AMBIGUITY');
      err.code = 'PDF_OCR_AMBIGUITY';
      throw err;
    }
    if (text.startsWith('## ')) {
      const heading = text.slice(3).trim();
      if (!heading) {
        const err = new Error('PDF_EMPTY_HEADING');
        err.code = 'PDF_EMPTY_HEADING';
        throw err;
      }
      blocks.push({ type: 'heading', level: 2, text: heading });
      continue;
    }
    blocks.push({ type: 'paragraph', text });
  }
  return blocks;
}

async function extractPdfStructured({ buffer }) {
  try {
    const pdfjs = await getPdfjs();
    const loadingTask = pdfjs.getDocument({ data: buffer });
    const pdf = await loadingTask.promise;
    let content = '';
    for (let p = 1; p <= pdf.numPages; p += 1) {
      const page = await pdf.getPage(p);
      const textContent = await page.getTextContent();
      const items = textContent.items.map((item) => item.str).join('\n');
      content += `${items}\n`;
    }
    const blocks = parseStrictPdfTextToBlocks(content);
    const hasHeading = blocks.some((block) => block.type === 'heading');
    if (!hasHeading) {
      const err = new Error('PDF_NO_EXPLICIT_HEADINGS');
      err.code = 'PDF_NO_EXPLICIT_HEADINGS';
      throw err;
    }
    return { blocks };
  } catch (error) {
    if (error && error.code && String(error.code).startsWith('PDF_')) throw error;
    const err = new Error(`PDF_EXTRACTION_FAILED: ${error.message}`);
    err.code = 'PDF_EXTRACTION_FAILED';
    throw err;
  }
}

module.exports = {
  parseStrictPdfTextToBlocks,
  extractPdfStructured,
};
