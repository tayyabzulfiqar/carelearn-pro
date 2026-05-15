const fs = require('fs');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const db = require('../config/database');

const UPLOADS_DIR = path.join(__dirname, '../../uploads/media');
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'carelearn';
const S3_REGION = process.env.S3_REGION || 'auto';
const S3_ENDPOINT = process.env.S3_ENDPOINT || undefined;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID || '';
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY || '';

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

const s3CompatibleProvider = {
  async save(buffer, objectKey, mimeType) {
    if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !STORAGE_BUCKET) {
      throw new Error('S3 credentials/bucket missing');
    }
    const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({
      region: S3_REGION,
      endpoint: S3_ENDPOINT,
      forcePathStyle: Boolean(S3_ENDPOINT),
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    });
    await client.send(new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: objectKey,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
      ChecksumSHA256: createHash('sha256').update(buffer).digest('base64'),
    }));
    const head = await client.send(new HeadObjectCommand({ Bucket: STORAGE_BUCKET, Key: objectKey }));
    return {
      objectKey,
      publicPath: `/storage/${objectKey}`,
      mimeType: mimeType || 'application/octet-stream',
      remote_etag: head.ETag || null,
      remote_checksum_sha256: head.ChecksumSHA256 || null,
      remote_content_length: head.ContentLength || null,
    };
  },
};

function getProvider() {
  if (['s3', 'r2', 'minio'].includes(STORAGE_PROVIDER)) return s3CompatibleProvider;
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
  if (!['s3', 'r2', 'minio'].includes(STORAGE_PROVIDER)) return null;
  const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    forcePathStyle: Boolean(S3_ENDPOINT),
    credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
  });
  return getSignedUrl(client, new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: objectKey }), { expiresIn: expiresInSeconds });
}

module.exports = { getProvider, saveObject, sha256, deterministicObjectKey, getSignedDownloadUrl };
