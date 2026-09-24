const express = require('express');

module.exports = function systemRoutes(cpuMonitor) {
  const router = express.Router();

  // GET /api/system/cpu - current reading
  router.get('/cpu', (req, res) => {
    res.json({ pid: process.pid, uptimeSeconds: Math.round(process.uptime()), cpu: cpuMonitor.getLatest() });
  });

  // POST /api/system/stress?seconds=10
  // just for demoing the auto restart - keeps the cpu busy for a few seconds.
  // off unless ENABLE_STRESS_ENDPOINT=true
  router.post('/stress', (req, res) => {
    if (process.env.ENABLE_STRESS_ENDPOINT !== 'true') {
      return res.status(403).json({ message: 'Set ENABLE_STRESS_ENDPOINT=true to use this demo endpoint' });
    }
    const seconds = Math.min(Number(req.query.seconds) || 10, 60);
    res.json({ message: `Burning CPU for ${seconds}s on pid ${process.pid}. Watch the logs.` });

    // burn in 200ms chunks so the monitor's setInterval still gets a turn
    const end = Date.now() + seconds * 1000;
    (function burn() {
      const sliceEnd = Date.now() + 200;
      while (Date.now() < sliceEnd) Math.sqrt(Math.random());
      if (Date.now() < end) setImmediate(burn);
    })();
  });

  return router;
};
