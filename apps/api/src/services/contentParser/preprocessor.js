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
const TAGGED_LINE_RE = /^\[[A-Z_]+\]/;
const NUMBERED_STEP_RE = /^\d{1,2}[.)]\s+\S/;

function injectHeuristicTag(line) {
  const trimmed = line.trim();
  if (!trimmed || TAGGED_LINE_RE.test(trimmed)) return line;

  const upper = trimmed.toUpperCase();
  const colonIdx = trimmed.indexOf(':');
  const head = (colonIdx > -1 ? trimmed.slice(0, colonIdx) : trimmed).trim();
  const tail = (colonIdx > -1 ? trimmed.slice(colonIdx + 1) : '').trim();

  if (/^(OBJECTIVES?|LEARNING OUTCOMES?)$/i.test(head)) {
    return `[OBJECTIVE_LIST]${tail ? ` ${tail}` : ''}`;
  }
  if (/^(WARNING|CAUTION|DANGER)$/i.test(head)) {
    return `[WARNING_BOX]${tail ? ` ${tail}` : ` ${trimmed}`}`;
  }
  if (/^(IMPORTANT|CRITICAL|MUST)$/i.test(head) || /^MUST\b/i.test(trimmed)) {
    return `[CRITICAL_INFORMATION]${tail ? ` ${tail}` : ` ${trimmed}`}`;
  }
  if (/^(NOTE|TIP|BEST PRACTICE)$/i.test(head)) {
    return `[BEST_PRACTICE]${tail ? ` ${tail}` : ` ${trimmed}`}`;
  }
  if (/^(QUESTION|Q)$/i.test(head)) {
    return `[QUIZ_POINT]${tail ? ` Question: ${tail}` : ` ${trimmed}`}`;
  }
  if (/^(SUMMARY|KEY POINTS?)$/i.test(head)) {
    return `[SUMMARY]${tail ? ` ${tail}` : ''}`;
  }
  if (NUMBERED_STEP_RE.test(trimmed)) {
    return `[STEP_LIST] ${trimmed}`;
  }

  const lettersOnly = trimmed.replace(/[^A-Za-z]/g, '');
  const isShort = trimmed.length <= 60;
  const hasAlpha = lettersOnly.length >= 4;
  const isAllCaps = trimmed === upper && /[A-Z]/.test(trimmed);
  if (isAllCaps && isShort && hasAlpha) {
    return `[SECTION_TITLE] ${trimmed}`;
  }

  return line;
}

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

    const injected = injectHeuristicTag(line);
    if (injected !== line) changed = true;
    kept.push(injected);
  }

  if (!changed) return text;
  return kept.join(newline);
}

module.exports = { preprocess };
