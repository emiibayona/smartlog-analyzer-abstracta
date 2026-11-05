const express = require('express');
const { AnalysisError } = require('../utils/analysisErrors');

const parseAnalysisBody = express.json({ limit: '1mb', strict: false, inflate: false });

function analysisDeadline(req, res, next) {
  req.bodyLimitLabel = '1 MiB';
  const controller = new AbortController();
  req.analysisSignal = controller.signal;
  const timer = setTimeout(() => {
    controller.abort(new AnalysisError('REQUEST_TIMEOUT'));
    if (!res.headersSent && !res.destroyed) {
      res.status(504).json({ error: 'Analysis request timed out', code: 'REQUEST_TIMEOUT', ...(req.analysisId ? { analysisId: req.analysisId } : {}) });
    }
  }, req.app.locals.analysisHttpTimeoutMs ?? 130000);
  const onClose = () => {
    clearTimeout(timer);
    if (!res.writableFinished) controller.abort(new AnalysisError('REQUEST_ABORTED'));
    req.off('aborted', onAbort);
  };
  const onAbort = () => { controller.abort(new AnalysisError('REQUEST_ABORTED')); clearTimeout(timer); };
  req.once('aborted', onAbort);
  res.once('close', onClose);
  res.once('finish', () => clearTimeout(timer));
  next();
}

module.exports = { analysisDeadline, parseAnalysisBody };
