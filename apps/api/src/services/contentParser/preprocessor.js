'use strict';

const CONTAMINATION_PREFIXES = [
  'IMAGE_ID',
  'FILENAME',
  'RATIO',
  'PLACEMENT',
  'STYLE',
  'PROMPT',
  'FRAME_STYLE',
  'NOTES',
  'SIZE',
  'ALIGNMENT',
];

const PREFIX_RE = new RegExp(`^(?:${CONTAMINATION_PREFIXES.join('|')})\\s*:`, 'i');
const BARE_IMG_RE = /^IMG_\d+$/i;
const SEPARATOR_RE = /^-{3,}$/;

function preprocess(input) {
  const text = typeof input === 'string' ? input : String(input ?? '');
  if (!text) return text;

  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const kept = [];
  let changed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isContamination = PREFIX_RE.test(trimmed)
      || BARE_IMG_RE.test(trimmed)
      || SEPARATOR_RE.test(trimmed);

    if (isContamination) {
      changed = true;
      continue;
    }
    kept.push(line);
  }

  if (!changed) return text;
  return kept.join(newline);
}

module.exports = { preprocess };

