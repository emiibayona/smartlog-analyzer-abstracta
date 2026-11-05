const { parseLogQuery } = require('../utils/logQuery');
const { listLogs } = require('../services/logService');

async function getLogs(req, res) {
  res.json(await listLogs(parseLogQuery(req.query), req.app.locals.queryTimeoutMs));
}

module.exports = { getLogs };
