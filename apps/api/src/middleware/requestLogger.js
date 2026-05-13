function requestLogger(req, _res, next) {
  const start = Date.now();
  const requestId = req.context?.requestId;

  _res.on('finish', () => {
    const duration = Date.now() - start;
    const tenant = req.tenant?.organisationId || '-';
    console.log(
      `[${requestId || '-'}] ${req.method} ${req.originalUrl} ${_res.statusCode} ${duration}ms tenant=${tenant}`
    );
  });

  next();
}

module.exports = { requestLogger };
