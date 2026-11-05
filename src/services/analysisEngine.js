const { loadAnalysisEnvironment } = require('../config/analysisEnvironment');
const { prepareAnalysisInput } = require('../utils/analysisInput');
const { validateReport } = require('../utils/analysisReport');
const { AnalysisError } = require('../utils/analysisErrors');
const { createGeminiAnalysisAdapter } = require('./geminiAnalysisAdapter');
const { createAnalysisRepository } = require('../repositories/analysisRepository');
const { log } = require('../utils/logger');

// Analyze a bounded batch, correlate chunk findings, and persist only fully validated results.
async function analyzeLogs(logs, options = {}) {
  const checkAborted = () => {
    if (options.signal?.aborted) throw options.signal.reason instanceof AnalysisError ? options.signal.reason : new AnalysisError('REQUEST_ABORTED');
  };
  checkAborted();
  let config;
  try { config = options.config || loadAnalysisEnvironment(); }
  catch { throw new AnalysisError('INVALID_CONFIGURATION'); }
  const prepared = prepareAnalysisInput(logs, config);
  const provider = options.provider || createGeminiAnalysisAdapter(config);
  const repository = options.repository || createAnalysisRepository(config.persistenceTimeoutMs);
  const id = await repository.create({
    microservice: prepared.microservices.length === 1 ? prepared.microservices[0] : 'multiple',
    microservices: prepared.microservices, date: new Date(), status: 'Pending',
    logIds: prepared.logIds, inputReferences: prepared.references,
    logCount: prepared.input.length, chunkCount: prepared.chunks.length,
    provider: 'gemini', model: config.model, mode: config.mode, promptVersion: 'warehouse-logs-v3',
    requestId: options.requestId,
  });
  const deadline = Date.now() + config.totalTimeoutMs;
  async function ask(input, ids) {
    checkAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new AnalysisError('ANALYSIS_TIMEOUT');
    const result = await provider.analyze(input, ids, Math.min(config.requestTimeoutMs, remaining), options.signal);
    checkAborted();
    if (Date.now() > deadline) throw new AnalysisError('ANALYSIS_TIMEOUT');
    return validateReport(result, ids);
  }
  try {
    options.onCreated?.(id);
    checkAborted();
    await repository.update(id, { status: 'In progress' });
    const reports = [];
    for (const chunk of prepared.chunks) {
      reports.push(await ask({ mode: config.mode, phase: 'chunk', logs: chunk }, chunk.map((entry) => entry.id)));
    }
    const report = reports.length === 1 ? reports[0] : await ask({ mode: config.mode, phase: 'synthesis', reports, evidenceLogIds: prepared.references }, prepared.references);
    checkAborted();
    const levelCounts = { info: 0, warn: 0, error: 0 };
    for (const entry of prepared.input) levelCounts[entry.level]++;
    await repository.update(id, { status: 'Completed', result: JSON.stringify(report), message: report.summary, report,
      levelCounts, completedAt: new Date(), errorCode: null });
    checkAborted();
    log('info', 'analysis_completed', { analysisId: id, logCount: prepared.input.length, chunkCount: reports.length });
    return { id, status: 'Completed', report };
  } catch (error) {
    const code = error instanceof AnalysisError ? error.code : 'ANALYSIS_FAILED';
    try {
      await repository.update(id, { status: 'Failed', errorCode: code, completedAt: new Date() }, true);
    } catch {
      log('error', 'analysis_failure_persistence_failed', { analysisId: id, code: 'PERSISTENCE_FAILED' });
      const failure = new AnalysisError('PERSISTENCE_FAILED');
      failure.analysisId = id;
      throw failure;
    }
    log('error', 'analysis_failed', { analysisId: id, code });
    const failure = new AnalysisError(code);
    failure.analysisId = id;
    throw failure;
  }
}

module.exports = { analyzeLogs };
