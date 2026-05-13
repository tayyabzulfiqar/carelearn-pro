const { buildValidationResult } = require('./training-ingestion-contract');
const { normalizeDocBlocksToStructured, structuredToNormalizedText } = require('./extraction-normalizer');

function adaptExtractedBlocksToCanonical({ blocks, imageFiles = [] }) {
  const structured = normalizeDocBlocksToStructured(blocks);
  const normalizedText = structuredToNormalizedText(structured);
  const validation = buildValidationResult({ sourceText: normalizedText, imageFiles });
  if (!validation.passed) {
    const err = new Error('CONTRACT_ADAPTER_VALIDATION_FAILED');
    err.code = 'CONTRACT_ADAPTER_VALIDATION_FAILED';
    err.details = validation.errors;
    throw err;
  }
  return {
    normalizedText,
    canonical: validation.canonical,
  };
}

module.exports = { adaptExtractedBlocksToCanonical };
