const { log, errorDetails } = require('../utils/logger');

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const parserErrors = {
    'entity.parse.failed': [400, 'Malformed JSON body'],
    'entity.too.large': [413, 'JSON body exceeds the 64 KiB limit'],
    'encoding.unsupported': [415, 'Unsupported content encoding'],
    'charset.unsupported': [415, 'Unsupported character encoding'],
    'request.aborted': [400, 'Request body was interrupted'],
    'request.size.invalid': [400, 'Invalid request body size'],
  };
  if (Object.hasOwn(parserErrors, error.type)) {
    const [status, message] = parserErrors[error.type];
    return res.status(status).json({ error: message });
  }
  if (error.status === 503) return res.status(503).json({ error: error.message });
  if ([400, 404].includes(error.status)) return res.status(error.status).json({ error: error.message });
  log('error', 'request_failed', { requestId: req.requestId, error: errorDetails(error) });
  if (error.code === 50 || error.name === 'MongoOperationTimeoutError' || error.name === 'MongoServerSelectionError') {
    return res.status(503).json({ error: 'Database temporarily unavailable' });
  }
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
