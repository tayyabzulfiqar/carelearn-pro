const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const orgRoutes = require('./routes/organisations.routes');
const courseRoutes = require('./routes/courses.routes');
const enrollmentRoutes = require('./routes/enrollments.routes');
const certificateRoutes = require('./routes/certificates.routes');
const certificatesController = require('./controllers/certificates.controller');
const uploadRoutes = require('./routes/upload.routes');
const adminRoutes = require('./routes/admin.routes');
const enterpriseRoutes = require('./routes/enterprise.routes');
const trainingCmsRoutes = require('./routes/cms/trainingCms.routes');
const opsRoutes = require('./routes/ops.routes');
const errorHandler = require('./middleware/errorHandler');
const { requestContext } = require('./middleware/requestContext');
const { attachTenant } = require('./middleware/tenant');
const { requestLogger } = require('./middleware/requestLogger');
const { attachApiHelpers } = require('./utils/apiResponse');
const { finalizeAudit } = require('./middleware/finalizeAudit');
const { bootstrapDatabase } = require('./bootstrap');
const { CERTIFICATE_ROOT } = require('./lib/certificate-image');

const app = express();
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  ...(process.env.CORS_EXTRA_ORIGINS ? process.env.CORS_EXTRA_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : []),
].filter(Boolean);

const databaseReady = bootstrapDatabase().catch((err) => {
  console.error('Database bootstrap failed', err);
  throw err;
});

const requireDatabaseReady = async (req, res, next) => {
  try {
    await databaseReady;
    next();
  } catch (err) {
    next(err);
  }
};

const noStoreStaticHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
};

const localImageRoots = [
  path.join(__dirname, '../uploads/local-images'),
  path.join(__dirname, '../uploads'),
];

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(requestContext);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(requestLogger);
app.use(express.json());
app.use(attachApiHelpers);
app.use(attachTenant);
app.use(finalizeAudit());

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/certificates', express.static(CERTIFICATE_ROOT, {
  immutable: false,
  maxAge: 0,
  setHeaders: noStoreStaticHeaders,
}));
app.get('/certificates/:fileName', requireDatabaseReady, certificatesController.downloadImage);
for (const root of localImageRoots) {
  app.use('/api/v1/local-images', express.static(root, {
    fallthrough: true,
    immutable: false,
    maxAge: 0,
    setHeaders: noStoreStaticHeaders,
  }));
}

app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'CareLearn API', version: '1.0.0' })
);
app.get('/api/v1/health', (req, res) =>
  res.json({ status: 'ok', service: 'CareLearn API', version: '1.0.0' })
);

app.use('/api/v1/auth', requireDatabaseReady, authRoutes);
app.use('/api/v1/users', requireDatabaseReady, userRoutes);
app.use('/api/v1/organisations', requireDatabaseReady, orgRoutes);
app.use('/api/v1/courses', requireDatabaseReady, courseRoutes);
app.use('/api/v1/enrollments', requireDatabaseReady, enrollmentRoutes);
app.use('/api/v1/certificates', requireDatabaseReady, certificateRoutes);
app.use('/api/v1/upload', requireDatabaseReady, uploadRoutes);
app.use('/api/v1/admin', requireDatabaseReady, adminRoutes);
app.use('/api/v1/admin/enterprise', requireDatabaseReady, enterpriseRoutes);
app.use('/api/v1/admin/ops', requireDatabaseReady, opsRoutes);
app.use('/api/v1/admin/cms', requireDatabaseReady, trainingCmsRoutes);

app.use(errorHandler);

module.exports = app;
