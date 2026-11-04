const express = require('express');
const { getApiRoot } = require('../controllers/apiController');
const { getLogs } = require('../controllers/logController');

const router = express.Router();
router.get('/', getApiRoot);
router.get('/logs', getLogs);

module.exports = router;
