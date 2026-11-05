const express = require('express');
const { getApiRoot } = require('../controllers/apiController');
const { getLogs, postLog } = require('../controllers/logController');
const { requireJson, parseLogBody } = require('../middlewares/logBodyParser');
const { getHealth } = require('../controllers/healthController');
const { getAnalyses, getAnalysis, submitAnalysis, submitStored } = require('../controllers/analysisController');
const { analysisDeadline, parseAnalysisBody } = require('../middlewares/analysisDeadline');

const router = express.Router();
router.get('/', getApiRoot);
router.get('/logs', getLogs);
router.post('/logs', requireJson, parseLogBody, postLog);
router.post('/logs/analyze', analysisDeadline, requireJson, parseAnalysisBody, submitAnalysis);
router.post('/logs/stored/analyze', analysisDeadline, requireJson, parseAnalysisBody, submitStored);
router.get('/health', getHealth);
router.get('/analysis', getAnalyses);
router.get('/analysis/:id', getAnalysis);

module.exports = router;
