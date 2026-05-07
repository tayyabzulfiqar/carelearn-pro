const appHandler = require('./index');

const PORT = Number(process.env.PORT || 5000);

const server = appHandler.listen(PORT, '0.0.0.0', () => {
  console.log(`CareLearn API listening on 0.0.0.0:${PORT}`);
});

const shutdown = (signal) => {
  console.log(`Received ${signal}, shutting down API...`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));