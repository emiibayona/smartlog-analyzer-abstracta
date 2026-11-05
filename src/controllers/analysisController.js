const { parseAnalysisQuery, parseAnalysisId } = require('../utils/analysisQuery');
const { listAnalyses, findAnalysis } = require('../services/analysisService');
const { parseRawAnalysis, parseStoredAnalysis } = require('../utils/analysisRequest');
const { analyzeLogs } = require('../services/analysisEngine');
const { submitStoredAnalysis } = require('../services/analysisSubmissionService');

function submissionOptions(req) {
  return { ...req.app.locals.analysisOptions, signal: req.analysisSignal, requestId: req.requestId,
    queryTimeoutMs: req.app.locals.queryTimeoutMs,
    onCreated: (id) => { req.analysisId = id; } };
}

async function submitAnalysis(req, res) {
  if (Object.keys(req.query).length) throw Object.assign(new Error('Query parameters are not supported for analysis submission'), { status: 400 });
  const logs = parseRawAnalysis(req.body);
  const result = await analyzeLogs(logs, submissionOptions(req));
  if (!res.headersSent && !res.destroyed) res.status(201).json(result);
}

async function submitStored(req, res) {
  if (Object.keys(req.query).length) throw Object.assign(new Error('Query parameters are not supported for analysis submission'), { status: 400 });
  const ids = parseStoredAnalysis(req.body);
  const result = await submitStoredAnalysis(ids, submissionOptions(req));
  if (!res.headersSent && !res.destroyed) res.status(201).json(result);
}

async function getAnalyses(req, res) {
  res.json(await listAnalyses(parseAnalysisQuery(req.query), req.app.locals.queryTimeoutMs));
}

async function getAnalysis(req, res) {
  if (Object.keys(req.query).length) throw Object.assign(new Error('Query parameters are not supported for analysis lookup'), { status: 400 });
  res.json(await findAnalysis(parseAnalysisId(req.params.id), req.app.locals.queryTimeoutMs));
}

module.exports = { getAnalyses, getAnalysis, submitAnalysis, submitStored };
