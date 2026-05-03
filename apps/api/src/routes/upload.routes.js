const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { uploadImages, uploadJson } = require('../config/upload');
const ctrl = require('../controllers/upload.controller');
const superAdmin = authorize('super_admin');

router.post('/images',
  authenticate, superAdmin,
  uploadImages.array('images', 50),
  ctrl.uploadImages
);

router.post('/courses/:courseId/content',
  authenticate, superAdmin,
  uploadJson.single('content'),
  ctrl.bulkUploadContent
);

module.exports = router;
