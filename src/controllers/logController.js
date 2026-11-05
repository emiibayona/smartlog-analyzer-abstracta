const { parseLogQuery } = require('../utils/logQuery');
const { listLogs } = require('../services/logService');
const { ingestLog } = require('../services/logIngestionService');

async function getLogs(req, res) {
  res.json(await listLogs(parseLogQuery(req.query), req.app.locals.queryTimeoutMs));
}

async function postLog(req, res) {
  if (Object.keys(req.query).length) throw Object.assign(new Error('Query parameters are not supported for log creation'), { status: 400 });
  if (!req.submissionJson) throw Object.assign(new Error('A JSON body is required'), { status: 400 });
  const result = await ingestLog({ body: req.body, submissionJson: req.submissionJson, requestId: req.requestId }, req.app.locals.queryTimeoutMs);
  res.status(result.status).json(result.body);
}

module.exports = { getLogs, postLog };
