'use strict';

const KNOWN_BLOCK_TYPES = new Set([
  'MODULE_TITLE', 'LESSON_TITLE', 'INTRO_TEXT', 'KEY_INFORMATION',
  'WARNING_BOX', 'CRITICAL_INFORMATION', 'STEP_LIST', 'IMAGE_SLOT',
  'QUIZ_POINT', 'SUMMARY', 'BEST_PRACTICE', 'IMPORTANT_NOTE',
  'SECTION_TITLE', 'OBJECTIVE_LIST', 'REFERENCE_TABLE',
  'REFLECTION_PROMPTS', 'COURSE_META', 'COURSE_INDEX',
]);

const BLOCK_OPEN_RE = /^\[([A-Z_]+)\](.*)/;
const IMAGE_ID_RE = /(?:ID=)?(IMG_\d+)/i;

/**
 * tokenise(text: string): Token[]
 * Reads a Content File string line-by-line and returns typed token objects.
 */
function tokenise(text) {
  const lines = text.split(/\r?\n/);
  const tokens = [];
  let currentBlockType = null;
  let quizBuffer = null;

  const debug = process.env.DEBUG === 'true';

  for (let lineNumber = 1; lineNumber <= lines.length; lineNumber++) {
    const raw = lines[lineNumber - 1];
    const trimmed = raw.trim();

    if (!trimmed) continue; // WHITESPACE — discard

    const blockMatch = trimmed.match(BLOCK_OPEN_RE);

    if (blockMatch) {
      const candidate = blockMatch[1];
      const rest = blockMatch[2].trim();

      if (!KNOWN_BLOCK_TYPES.has(candidate)) {
        // Unknown tag — treat as BLOCK_CONTENT of previous block
        tokens.push({ type: 'BLOCK_CONTENT', blockType: null, content: trimmed, lineNumber });
        continue;
      }

      // Flush any open QUIZ_POINT buffer
      if (quizBuffer) {
        tokens.push(quizBuffer);
        quizBuffer = null;
      }

      currentBlockType = candidate;

      if (candidate === 'IMAGE_SLOT') {
        const idMatch = rest.match(IMAGE_ID_RE);
        tokens.push({
          type: 'BLOCK_OPEN',
          blockType: 'IMAGE_SLOT',
          imageId: idMatch ? idMatch[1].toUpperCase() : null,
          content: '',
          lineNumber,
        });
      } else if (candidate === 'QUIZ_POINT') {
        quizBuffer = {
          type: 'BLOCK_OPEN',
          blockType: 'QUIZ_POINT',
          content: rest,
          lineNumber,
          quizLines: rest ? [rest] : [],
        };
      } else {
        tokens.push({
          type: 'BLOCK_OPEN',
          blockType: candidate,
          content: rest,
          lineNumber,
        });
      }
    } else {
      // BLOCK_CONTENT line — belongs to current block
      if (quizBuffer) {
        quizBuffer.quizLines.push(trimmed);
      } else {
        tokens.push({
          type: 'BLOCK_CONTENT',
          blockType: currentBlockType,
          content: trimmed,
          lineNumber,
        });
      }
    }
  }

  // Flush trailing QUIZ_POINT buffer
  if (quizBuffer) {
    tokens.push(quizBuffer);
  }

  // Parse quizLines into structured quiz data
  for (const token of tokens) {
    if (token.blockType === 'QUIZ_POINT' && token.quizLines) {
      token.quizData = parseQuizLines(token.quizLines);
      delete token.quizLines;
    }
  }

  if (debug) {
    console.log(`[tokeniser] ${tokens.length} tokens`);
    console.log('[tokeniser] first 5:', JSON.stringify(tokens.slice(0, 5), null, 2));
  }

  return tokens;
}

function parseQuizLines(lines) {
  const quiz = { question: '', options: {}, correct: null, rationale: '' };
  for (const line of lines) {
    const m = line.match(/^(Question|A|B|C|D|Correct|Rationale):\s*(.*)/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'question') quiz.question = val;
    else if (key === 'correct') quiz.correct = parseInt(val, 10);
    else if (key === 'rationale') quiz.rationale = val;
    else quiz.options[key.toUpperCase()] = val;
  }
  // Convert options object to ordered array
  quiz.optionsArray = ['A', 'B', 'C', 'D'].map(k => quiz.options[k] || '').filter(Boolean);
  return quiz;
}

module.exports = { tokenise };
