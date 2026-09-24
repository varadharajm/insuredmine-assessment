const path = require('path');
const fs = require('fs/promises');
const { Worker } = require('worker_threads');
const { MONGO_URI } = require('../config/env');
const importTracker = require('../services/importTracker');

// spin up a worker thread for the import and wait for it to report back
function runImportWorker(filePath, originalName) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, '../workers/importWorker.js'), {
      workerData: { filePath, originalName, mongoUri: MONGO_URI },
    });
    worker.once('message', (msg) => (msg.ok ? resolve(msg.result) : reject(new Error(msg.error))));
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Import worker stopped with exit code ${code}`));
    });
  });
}

// POST /api/upload (form-data, key "file")
async function uploadFile(req, res) {
  if (!req.file) return res.status(400).json({ message: 'Attach a CSV or XLSX file as form-data (key "file", type File)' });
  importTracker.start();
  try {
    const result = await runImportWorker(req.file.path, req.file.originalname);
    res.status(201).json({ message: 'File imported successfully', ...result });
  } catch (err) {
    res.status(500).json({ message: 'Import failed', error: err.message });
  } finally {
    importTracker.end();
    fs.unlink(req.file.path).catch(() => {});
  }
}

module.exports = { uploadFile, runImportWorker };
