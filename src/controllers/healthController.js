const { checkHealth } = require('../services/healthService');

async function getHealth(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    await checkHealth(req.app.locals.healthTimeoutMs);
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ error: 'Database unavailable' });
  }
}

module.exports = { getHealth };
