const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const courseId = req.body.courseId || req.params.courseId;
    const dir = courseId
      ? path.join(__dirname, `../../uploads/course-${courseId}/images`)
      : path.join(__dirname, '../../uploads/images');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  }
});

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../../uploads/media');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  }
});

const imageFilter = (req, file, cb) => {
  const allowed = ['.jpg','.jpeg','.png','.webp','.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  allowed.includes(ext) ? cb(null, true) : cb(new Error('Images only'), false);
};

const mediaFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.mp4', '.mov', '.webm'];
  allowed.includes(ext) ? cb(null, true) : cb(new Error('Unsupported media type'), false);
};

exports.uploadImages = multer({
  storage: imageStorage, fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 50 }
});

exports.uploadMedia = multer({
  storage: mediaStorage, fileFilter: mediaFilter,
  limits: { fileSize: 200 * 1024 * 1024, files: 20 }
});
