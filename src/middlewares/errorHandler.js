const { log, errorDetails } = require('../utils/logger');

function errorHandler(error, req, res, next) {
  if (req.analysisSignal?.aborted && res.headersSent) return;
  if (res.headersSent) return next(error);
  if (res.destroyed) return;
  if (error.name === 'AnalysisError') {
    const mapping = {
      INVALID_INPUT: [400, 'Invalid analysis log batch'], INPUT_TOO_LARGE: [413, 'Analysis input exceeds configured limits'],
      INVALID_CONFIGURATION: [503, 'Analysis service is not configured'],
      PROVIDER_TIMEOUT: [504, 'Analysis provider timed out'], ANALYSIS_TIMEOUT: [504, 'Analysis timed out'],
      REQUEST_TIMEOUT: [504, 'Analysis request timed out'], REQUEST_ABORTED: [408, 'Analysis request was interrupted'],
      PROVIDER_AUTH: [503, 'Analysis provider is unavailable'], PROVIDER_RATE_LIMIT: [503, 'Analysis provider is busy'],
      PROVIDER_ERROR: [502, 'Analysis provider failed'], PROVIDER_REFUSAL: [502, 'Analysis provider did not produce a report'],
      INVALID_RESPONSE: [502, 'Analysis provider returned an invalid report'], PERSISTENCE_FAILED: [503, 'Analysis storage is unavailable'],
    };
    const [status, message] = mapping[error.code] || [500, 'Analysis failed'];
    return res.status(status).json({ error: message, code: error.code, ...(error.analysisId ? { analysisId: error.analysisId } : {}) });
  }
  const parserErrors = {
    'entity.parse.failed': [400, 'Malformed JSON body'],
    'entity.too.large': [413, `JSON body exceeds the ${req.bodyLimitLabel || '64 KiB'} limit`],
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
