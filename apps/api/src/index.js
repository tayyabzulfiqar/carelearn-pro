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
const uploadRoutes = require('./routes/upload.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const LOCAL_FIRE_SAFETY_ROOT = 'C:/Users/HP/Desktop/uk training';
const allowedOrigins = [
  process.env.CORS_ORIGIN || 'http://localhost:8081',
  'http://127.0.0.1:8081',
];

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
}));
app.use(morgan('dev'));
app.use(express.json());

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/v1/local-images', express.static(LOCAL_FIRE_SAFETY_ROOT, {
  fallthrough: false,
  immutable: false,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  },
}));

app.get('/health', (req, res) =>
  res.json({ status: 'ok', service: 'CareLearn API', version: '1.0.0' })
);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/organisations', orgRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/enrollments', enrollmentRoutes);
app.use('/api/v1/certificates', certificateRoutes);
app.use('/api/v1/upload', uploadRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`CareLearn API running on port ${PORT}`)
);

module.exports = app;
