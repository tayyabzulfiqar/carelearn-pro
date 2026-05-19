'use strict';

const { tokenise } = require('./tokeniser');
const { buildTree } = require('./treeBuilder');
const { parseMapping } = require('./mappingParser');
const { validate } = require('./validator');
const { resolve } = require('./resolver');

/**
 * parseContentPackage(file1Text, file2Text, courseId, db): ParseResult
 * Orchestrates the full 5-stage pipeline.
 */
async function parseContentPackage(file1Text, file2Text, courseId, db) {
  const errors = [];

  // Stage 1: Tokenise FILE 1
  let tokens;
  try {
    tokens = tokenise(file1Text);
  } catch (err) {
    return _fatal(`Stage 1 (tokenise) failed: ${err.message}`);
  }

  // Stage 2: Build Course DOM
  let courseDom;
  try {
    courseDom = buildTree(tokens);
  } catch (err) {
    return _fatal(`Stage 2 (buildTree) failed: ${err.message}`);
  }

  // Stage 3: Parse FILE 2
  let mappingResult;
  try {
    mappingResult = parseMapping(file2Text);
  } catch (err) {
    return _fatal(`Stage 3 (parseMapping) failed: ${err.message}`);
  }
  const { index: mappingIndex, recordCount, validationErrors: mappingErrors } = mappingResult;
  errors.push(...mappingErrors.map(e => ({ stage: 'mapping', message: e })));

  // Stage 4: Validate cross-file integrity
  let validationResult;
  try {
    validationResult = validate(courseDom, mappingIndex);
  } catch (err) {
    return _fatal(`Stage 4 (validate) failed: ${err.message}`);
  }
  if (!validationResult.isValid) {
    errors.push(...validationResult.blockingErrors.map(e => ({ stage: 'validation', ...e })));
  }

  // Stage 5: Resolve images (even if validation has warnings — only skip on blocking errors)
  let resolvedCourseDom = courseDom;
  let resolutionReport = { resolvedCount: 0, pendingCount: 0, errorCount: 0, errors: [], pendingAssets: [] };

  try {
    const result = await resolve(courseDom, mappingIndex, db);
    resolvedCourseDom = result.courseDom;
    resolutionReport = result.resolutionReport;
  } catch (err) {
    errors.push({ stage: 'resolution', message: `Resolution failed: ${err.message}` });
  }

  const canPublish = validationResult.isValid && mappingErrors.length === 0;

  return {
    resolvedCourseDom,
    courseDom: resolvedCourseDom,
    mappingIndex,
    mappingRecordCount: recordCount,
    validationResult,
    resolutionReport,
    stats: resolvedCourseDom.stats,
    errors,
    canPublish,
  };
}

function _fatal(message) {
  return {
    resolvedCourseDom: null,
    courseDom: null,
    mappingIndex: {},
    mappingRecordCount: 0,
    validationResult: { isValid: false, blockingErrors: [{ rule: 0, imageId: null, detail: message }], warnings: [], summary: message },
    resolutionReport: { resolvedCount: 0, pendingCount: 0, errorCount: 0, errors: [], pendingAssets: [] },
    stats: { moduleCount: 0, lessonCount: 0, blockCount: 0, imageSlotCount: 0, imageIds: [] },
    errors: [{ stage: 'fatal', message }],
    canPublish: false,
  };
}

module.exports = { parseContentPackage };
