const express = require('express');
const { getApiRoot } = require('../controllers/apiController');

const router = express.Router();
router.get('/', getApiRoot);

module.exports = router;
