'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_UPLOADS_ROOT = path.resolve(__dirname, '../../uploads');
const DEFAULT_WEB_PUBLIC_ROOT = path.resolve(__dirname, '../../../web/public');

function getUploadsRoot() {
  return path.resolve(process.env.CARELEARN_UPLOADS_ROOT || DEFAULT_UPLOADS_ROOT);
}

function getWebPublicRoot() {
  return path.resolve(process.env.CARELEARN_WEB_PUBLIC_ROOT || DEFAULT_WEB_PUBLIC_ROOT);
}

function hasMeaningfulText(value = '') {
  return String(value || '').trim().length > 0;
}

function resolveExistingPath(rootDir, relativePath) {
  const normalizedRoot = path.resolve(rootDir);
  const candidate = path.resolve(normalizedRoot, relativePath);
  if (candidate !== normalizedRoot && !candidate.startsWith(`${normalizedRoot}${path.sep}`)) {
    return null;
  }
  return fs.existsSync(candidate) ? candidate : null;
}

function validateLocalUploadPath(reference) {
  const uploadsRoot = getUploadsRoot();
  const relativePath = reference.replace(/^\/uploads\/?/, '');
  return resolveExistingPath(uploadsRoot, relativePath)
    ? { ok: true }
    : { ok: false, code: 'MEDIA_ASSET_MISSING', message: `Missing uploaded asset: ${reference}` };
}

function validateLocalImagePath(reference) {
  const uploadsRoot = getUploadsRoot();
  const relativePath = reference.replace(/^\/api\/v1\/local-images\/?/, '');
  const roots = [
    path.join(uploadsRoot, 'local-images'),
    uploadsRoot,
  ];

  const exists = roots.some((rootDir) => Boolean(resolveExistingPath(rootDir, relativePath)));
  return exists
    ? { ok: true }
    : { ok: false, code: 'MEDIA_ASSET_MISSING', message: `Missing local image asset: ${reference}` };
}

function validatePublicAssetPath(reference) {
  const relativePath = reference.replace(/^\//, '');
  return resolveExistingPath(getWebPublicRoot(), relativePath)
    ? { ok: true }
    : { ok: false, code: 'MEDIA_ASSET_MISSING', message: `Missing public lesson asset: ${reference}` };
}

function validateMediaReference(reference = '') {
  if (!hasMeaningfulText(reference)) {
    return { ok: false, code: 'MEDIA_SOURCE_REQUIRED', message: 'Media blocks must include a usable source before publishing.' };
  }

  if (/^https?:\/\//i.test(reference)) {
    return { ok: true };
  }

  if (reference.startsWith('/api/v1/uploads/')) {
    return {
      ok: false,
      code: 'MEDIA_SOURCE_INVALID',
      message: `Unsupported media route: ${reference}. Use /uploads/... for local media assets.`,
    };
  }

  if (reference.startsWith('/uploads/')) {
    return validateLocalUploadPath(reference);
  }

  if (reference.startsWith('/api/v1/local-images/')) {
    return validateLocalImagePath(reference);
  }

  if (reference.startsWith('/course-assets/') || reference.startsWith('/bls/')) {
    return validatePublicAssetPath(reference);
  }

  if (reference.startsWith('/certificates/')) {
    return { ok: true };
  }

  if (reference.startsWith('/')) {
    return {
      ok: false,
      code: 'MEDIA_SOURCE_INVALID',
      message: `Unsupported media route: ${reference}`,
    };
  }

  return {
    ok: false,
    code: 'MEDIA_SOURCE_INVALID',
    message: `Unsupported media reference: ${reference}`,
  };
}

module.exports = {
  validateMediaReference,
};
