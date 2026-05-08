const { recordAudit } = require('./audit');

function finalizeAudit() {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      recordAudit(req, res.statusCode, {
        outcome: res.statusCode >= 400 ? 'error' : 'success',
      }).catch(() => {});
      return originalJson(payload);
    };

    return next();
  };
}

module.exports = { finalizeAudit };