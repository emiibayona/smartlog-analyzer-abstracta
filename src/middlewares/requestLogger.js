const { randomUUID } = require('node:crypto');
const { log } = require('../utils/logger');

function requestLogger(req, res, next) {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const start = performance.now();
  res.once('finish', () => log('info', 'http_request', {
    requestId: req.requestId, method: req.method, route: req.route?.path || 'unmatched',
    status: res.statusCode, durationMs: Math.round(performance.now() - start),
  }));
  next();
}

module.exports = requestLogger;
