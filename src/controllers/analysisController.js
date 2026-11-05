const { parseAnalysisQuery, parseAnalysisId } = require('../utils/analysisQuery');
const { listAnalyses, findAnalysis } = require('../services/analysisService');

async function getAnalyses(req, res) {
  res.json(await listAnalyses(parseAnalysisQuery(req.query), req.app.locals.queryTimeoutMs));
}

async function getAnalysis(req, res) {
  if (Object.keys(req.query).length) throw Object.assign(new Error('Query parameters are not supported for analysis lookup'), { status: 400 });
  res.json(await findAnalysis(parseAnalysisId(req.params.id), req.app.locals.queryTimeoutMs));
}

module.exports = { getAnalyses, getAnalysis };
