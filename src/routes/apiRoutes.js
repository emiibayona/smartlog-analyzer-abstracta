const express = require('express');
const { getApiRoot } = require('../controllers/apiController');
const { getLogs } = require('../controllers/logController');
const { getHealth } = require('../controllers/healthController');

const router = express.Router();
router.get('/', getApiRoot);
router.get('/logs', getLogs);
router.get('/health', getHealth);

module.exports = router;
