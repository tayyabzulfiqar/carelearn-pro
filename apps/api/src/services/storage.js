const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '../../uploads/media');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const localProvider = {
  async save(buffer, originalName, mimeType) {
    ensureDir(UPLOADS_DIR);
    const ext = path.extname(originalName) || '';
    const fileName = `${randomUUID()}${ext}`;
    const filePath = path.join(UPLOADS_DIR, fileName);
    await fs.promises.writeFile(filePath, buffer);
    return {
      fileName,
      publicPath: `/uploads/media/${fileName}`,
      mimeType: mimeType || 'application/octet-stream',
    };
  },
};

function getProvider() {
  return localProvider;
}

module.exports = { getProvider };
