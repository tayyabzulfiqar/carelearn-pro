const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { uploadImages, uploadJson, uploadMedia } = require('../config/upload');
const ctrl = require('../controllers/upload.controller');
const adminOrHigher = authorize('super_admin', 'org_admin');

router.post('/images',
  authenticate, adminOrHigher,
  uploadImages.array('images', 50),
  ctrl.uploadImages
);

router.post('/media',
  authenticate, adminOrHigher,
  uploadMedia.array('files', 20),
  ctrl.uploadMedia
);

router.post('/courses/:courseId/content',
  authenticate, adminOrHigher,
  uploadJson.single('content'),
  ctrl.bulkUploadContent
);

module.exports = router;
