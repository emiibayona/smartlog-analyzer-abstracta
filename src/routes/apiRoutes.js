const express = require('express');
const { getApiRoot } = require('../controllers/apiController');
const { getLogs } = require('../controllers/logController');
const { getHealth } = require('../controllers/healthController');
const { getAnalyses, getAnalysis } = require('../controllers/analysisController');

const router = express.Router();
router.get('/', getApiRoot);
router.get('/logs', getLogs);
router.get('/health', getHealth);
router.get('/analysis', getAnalyses);
router.get('/analysis/:id', getAnalysis);

module.exports = router;
