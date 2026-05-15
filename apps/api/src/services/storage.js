const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const db = require('../config/database');

const UPLOADS_DIR = path.join(__dirname, '../../uploads/media');
const STORAGE_PROVIDER = 'local_vps';
const STORAGE_BUCKET = 'vps-local';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const localProvider = {
  async save(buffer, objectKey, mimeType) {
    ensureDir(UPLOADS_DIR);
    const filePath = path.join(UPLOADS_DIR, objectKey);
    ensureDir(path.dirname(filePath));
    await fs.promises.writeFile(filePath, buffer);
    return {
      objectKey,
      publicPath: `/uploads/media/${objectKey}`,
      mimeType: mimeType || 'application/octet-stream',
    };
  },
};

function getProvider() {
  return localProvider;
}

function deterministicObjectKey(refType, originalName) {
  const ext = path.extname(originalName || '') || '.bin';
  return `${refType}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function saveObject({ organisationId = null, refType, refId = null, buffer, originalName, mimeType, createdBy = null }) {
  const objectKey = deterministicObjectKey(refType, originalName);
  const provider = getProvider();
  const saved = await provider.save(buffer, objectKey, mimeType);
  const checksum = sha256(buffer);
  const byteSize = Buffer.byteLength(buffer);
  await db.query(
    `INSERT INTO storage_objects
     (organisation_id, bucket, object_key, provider, checksum_sha256, byte_size, mime_type, ref_type, ref_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [organisationId, STORAGE_BUCKET, objectKey, STORAGE_PROVIDER, checksum, byteSize, mimeType || null, refType, refId, createdBy]
  );
  return { ...saved, objectKey, checksum, byteSize, provider: STORAGE_PROVIDER, bucket: STORAGE_BUCKET };
}

async function getSignedDownloadUrl(objectKey, expiresInSeconds = 900) {
  const exp = Date.now() + (Number(expiresInSeconds) * 1000);
  return `/uploads/media/${objectKey}?exp=${exp}`;
}

module.exports = { getProvider, saveObject, sha256, deterministicObjectKey, getSignedDownloadUrl };
