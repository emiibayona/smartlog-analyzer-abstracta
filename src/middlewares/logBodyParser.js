const express = require('express');

function requireJson(req, res, next) {
  if (!req.is('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
  const charset = req.get('Content-Type').match(/charset\s*=\s*"?([^";\s]+)/i);
  if (charset && charset[1].toLowerCase() !== 'utf-8') return res.status(415).json({ error: 'Only UTF-8 JSON is supported' });
  next();
}

const parseLogBody = express.json({
  limit: '64kb', strict: false, inflate: false,
  verify(req, res, buffer) { req.submissionJson = buffer.toString('utf8'); },
});

module.exports = { requireJson, parseLogBody };
