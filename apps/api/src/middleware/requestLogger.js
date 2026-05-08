function requestLogger(req, _res, next) {
  const start = Date.now();
  const requestId = req.context?.requestId;
  const tenant = req.tenant?.organisationId || '-';

  _res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${requestId || '-'}] ${req.method} ${req.originalUrl} ${_res.statusCode} ${duration}ms tenant=${tenant}`
    );
  });

  next();
}

module.exports = { requestLogger };