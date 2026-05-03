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

const jsonStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/slides');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const imageFilter = (req, file, cb) => {
  const allowed = ['.jpg','.jpeg','.png','.webp','.gif'];
  const ext = path.extname(file.originalname).toLowerCase();
  allowed.includes(ext) ? cb(null, true) : cb(new Error('Images only'), false);
};

const jsonFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  ext === '.json' ? cb(null, true) : cb(new Error('JSON only'), false);
};

exports.uploadImages = multer({
  storage: imageStorage, fileFilter: imageFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 50 }
});

exports.uploadJson = multer({
  storage: jsonStorage, fileFilter: jsonFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});
