const express = require('express');
const { scheduleMessage, listScheduled, listMessages } = require('../controllers/message.controller');

const router = express.Router();

router.post('/schedule', scheduleMessage);
router.get('/scheduled', listScheduled);
router.get('/', listMessages);

module.exports = router;
