function attachApiHelpers(req, res, next) {
  res.success = (data = {}, meta = {}, statusCode = 200) => {
    res.status(statusCode).json({ success: true, data, meta });
  };

  res.fail = (message, code = 'REQUEST_FAILED', statusCode = 400, details = null) => {
    res.status(statusCode).json({
      success: false,
      error: { code, message, details },
    });
  };

  next();
}

module.exports = { attachApiHelpers };