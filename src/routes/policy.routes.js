const path = require('path');
const express = require('express');
const multer = require('multer');
const { uploadFile } = require('../controllers/upload.controller');
const { searchByUsername, aggregateByUser } = require('../controllers/policy.controller');

const router = express.Router();

const upload = multer({
  dest: path.join(__dirname, '../../uploads'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['.csv', '.xlsx', '.xls'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only .csv, .xlsx or .xls files are allowed'), ok);
  },
});

// any() instead of single('file') so a different key name in postman
// doesn't break the upload. only the first file is used.
router.post('/upload', upload.any(), (req, res, next) => {
  req.file = req.files && req.files[0];
  next();
}, uploadFile);
router.get('/policies/search', searchByUsername);
router.get('/policies/aggregate', aggregateByUser);

module.exports = router;
