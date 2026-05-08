const { randomUUID } = require('crypto');

function requestContext(req, _res, next) {
  req.context = {
    requestId: req.headers['x-request-id'] || randomUUID(),
    tenantId: req.headers['x-tenant-id'] || null,
    startedAt: Date.now(),
  };
  next();
}

module.exports = { requestContext };