function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.status === 400) return res.status(400).json({ error: error.message });
  console.error('Request failed:', error.name);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
