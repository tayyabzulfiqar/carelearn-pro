const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const CERTIFICATE_ROOT = path.join(os.tmpdir(), 'carelearn-certificates');
const TEMPLATE_PATH = path.resolve(__dirname, '../content/fire-safety/certificate_fire_safety.png');

function safeSlug(value) {
  return String(value || 'certificate')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function formatDate(value = new Date()) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function fitText(ctx, text, maxWidth, startSize, family = 'Georgia') {
  let size = startSize;
  do {
    ctx.font = `700 ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 4;
  } while (size >= 32);
  return size;
}

async function generateCertificateImage({ userId, userName, courseTitle, issuedAt }) {
  await fs.mkdir(CERTIFICATE_ROOT, { recursive: true });

  const template = await loadImage(TEMPLATE_PATH);
  const width = template.width;
  const height = template.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(template, 0, 0, width, height);
  ctx.fillStyle = '#3b2418';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const name = userName || 'Tayyab Abbasi';
  const course = courseTitle || 'Fire Safety Awareness';
  const date = formatDate(issuedAt);

  const nameSize = fitText(ctx, name, width * 0.66, Math.round(width * 0.055));
  ctx.font = `700 ${nameSize}px Georgia`;
  ctx.fillText(name, width / 2, height * 0.46);

  ctx.font = `600 ${Math.round(width * 0.023)}px Georgia`;
  ctx.fillText(course, width / 2, height * 0.55);

  ctx.font = `600 ${Math.round(width * 0.019)}px Georgia`;
  ctx.textAlign = 'left';
  ctx.fillText(date, width * 0.14, height * 0.845);

  ctx.textAlign = 'center';
  ctx.font = `500 ${Math.round(width * 0.017)}px Georgia`;
  ctx.fillText('Director: Nargis Nawaz', width * 0.73, height * 0.78);
  ctx.fillText('Flexible Health Care One Solution Ltd', width / 2, height * 0.62);

  const fileName = `${safeSlug(userId)}-${safeSlug(course)}.png`;
  const filePath = path.join(CERTIFICATE_ROOT, fileName);
  await fs.writeFile(filePath, canvas.toBuffer('image/png'));

  return {
    fileName,
    filePath,
    publicUrl: `/certificates/${fileName}`,
  };
}

module.exports = {
  CERTIFICATE_ROOT,
  generateCertificateImage,
};
