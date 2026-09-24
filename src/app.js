// Express app + DB connection. index.js runs this inside a cluster worker
// and brings it back up if it dies.
const express = require('express');
const mongoose = require('mongoose');
const config = require('./config/env');
const { connectDB } = require('./config/db');
const { startCpuMonitor } = require('./services/cpuMonitor');
const { startScheduler } = require('./services/messageScheduler');
const policyRoutes = require('./routes/policy.routes');
const messageRoutes = require('./routes/message.routes');
const systemRoutes = require('./routes/system.routes');

async function startServer() {
  await connectDB(config.MONGO_URI);

  const app = express();
  app.use(express.json());

  let server;

  const cpuMonitor = startCpuMonitor({
    threshold: config.CPU_THRESHOLD,
    intervalMs: config.CPU_CHECK_INTERVAL_MS,
    breachCount: config.CPU_BREACH_COUNT,
    warmupMs: config.CPU_WARMUP_MS,
    onThresholdExceeded: (sample) => {
      console.warn(`[cpu] ${sample.serverPercent}% >= ${config.CPU_THRESHOLD}% - restarting server (pid ${process.pid})`);
      shutdown(1);
    },
  });

  const scheduler = startScheduler({ pollMs: config.SCHEDULER_POLL_MS });

  app.get('/', (req, res) => res.json({ status: 'ok', pid: process.pid }));
  app.use('/api', policyRoutes);
  app.use('/api/messages', messageRoutes);
  app.use('/api/system', systemRoutes(cpuMonitor));

  app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.name === 'MulterError' || /allowed/.test(err.message) ? 400 : 500;
    const message =
      err.code === 'MISSING_FIELD_NAME'
        ? 'The form-data key is empty. In Postman, type "file" in the Key column and set its type to File.'
        : err.message;
    res.status(status).json({ message });
  });

  server = app.listen(config.PORT, () => console.log(`[server] listening on :${config.PORT} (pid ${process.pid})`));

  // graceful shutdown - stop accepting requests, close mongo, exit.
  // exit code 1 = "please restart me" for the primary process.
  let stopping = false;
  function shutdown(code) {
    if (stopping) return;
    stopping = true;
    cpuMonitor.stop();
    scheduler.stop();
    const force = setTimeout(() => process.exit(code), 5000);
    force.unref();
    server.close(async () => {
      await mongoose.disconnect().catch(() => {});
      process.exit(code);
    });
    server.closeAllConnections?.();
  }

  process.on('SIGTERM', () => shutdown(0));
  process.on('SIGINT', () => shutdown(0));
  return { app, server };
}

module.exports = { startServer };

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[server] failed to start:', err.message);
    process.exit(1);
  });
}
