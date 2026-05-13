const MARKER_PATTERN = /^\[(IMAGE_(\d+))(?:_(LEFT|RIGHT|CENTER))?\]$/;

function extractImageMarkerFromText(line) {
  const match = MARKER_PATTERN.exec(String(line || '').trim());
  if (!match) return null;
  return {
    type: 'image_marker',
    key: match[1],
    align: (match[3] || 'CENTER').toLowerCase(),
  };
}

function validateMarkerUniqueness(blocks) {
  const seen = new Set();
  for (const block of blocks) {
    if (block.type !== 'image_marker') continue;
    if (seen.has(block.key)) {
      const err = new Error(`DUPLICATE_IMAGE_MARKER: ${block.key}`);
      err.code = 'DUPLICATE_IMAGE_MARKER';
      throw err;
    }
    seen.add(block.key);
  }
}

module.exports = {
  extractImageMarkerFromText,
  validateMarkerUniqueness,
};
