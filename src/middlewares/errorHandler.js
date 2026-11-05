const { log, errorDetails } = require('../utils/logger');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.status === 400) return res.status(400).json({ error: error.message });
  log('error', 'request_failed', { requestId: req.requestId, error: errorDetails(error) });
  if (error.code === 50 || error.name === 'MongoOperationTimeoutError' || error.name === 'MongoServerSelectionError') {
    return res.status(503).json({ error: 'Database temporarily unavailable' });
  }
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
