const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { uploadImages, uploadMedia } = require('../config/upload');
const ctrl = require('../controllers/upload.controller');
const superAdminOnly = authorize('super_admin');

router.post('/images',
  authenticate, superAdminOnly,
  uploadImages.array('images', 50),
  ctrl.uploadImages
);

router.post('/media',
  authenticate, superAdminOnly,
  uploadMedia.array('files', 20),
  ctrl.uploadMedia
);

module.exports = router;
