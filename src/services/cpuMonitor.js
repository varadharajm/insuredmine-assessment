// Checks the server's cpu every second and calls onThresholdExceeded
// when it stays above the limit.
//
// cpu % = cpu time used since last check / real time passed (100% = one core)
//
// Only the main thread matters here (that's what serves requests). Newer node
// has process.threadCpuUsage() for exactly that. On older versions we only get
// process.cpuUsage(), which also counts the import worker threads - so while an
// import is running we just ignore the readings.
const os = require('os');
const importTracker = require('./importTracker');

const hasThreadCpu = typeof process.threadCpuUsage === 'function';
const readServerCpu = hasThreadCpu ? () => process.threadCpuUsage() : () => process.cpuUsage();
const measuring = hasThreadCpu ? 'main-thread' : 'process (import time excluded)';

function startCpuMonitor({ threshold, intervalMs, breachCount, warmupMs = 10000, onThresholdExceeded }) {
  const startedAt = Date.now();
  let lastServer = readServerCpu();
  let lastProcess = process.cpuUsage();
  let lastTime = process.hrtime.bigint();
  let consecutive = 0;
  let latest = { serverPercent: 0, processPercent: 0, systemLoad1m: 0, threshold, measuring, counting: false };

  console.log(`[cpu] monitoring ${measuring}, restart at >= ${threshold}% for ${breachCount} samples`);

  const pct = (now, prev, elapsedMicros) =>
    ((now.user - prev.user + (now.system - prev.system)) / elapsedMicros) * 100;

  const timer = setInterval(() => {
    const nowTime = process.hrtime.bigint();
    const elapsedMicros = Number(nowTime - lastTime) / 1000;
    const serverNow = readServerCpu();
    const procNow = process.cpuUsage();

    const serverPercent = pct(serverNow, lastServer, elapsedMicros);
    const processPercent = pct(procNow, lastProcess, elapsedMicros); // whole process, just for display

    lastServer = serverNow;
    lastProcess = procNow;
    lastTime = nowTime;

    // don't count: the first few seconds after boot, or an import on older node
    const warmingUp = Date.now() - startedAt < warmupMs;
    const importNoise = !hasThreadCpu && importTracker.isBusy();
    const counting = !warmingUp && !importNoise;

    latest = {
      serverPercent: Number(serverPercent.toFixed(1)),
      processPercent: Number(processPercent.toFixed(1)),
      systemLoad1m: Number(os.loadavg()[0].toFixed(2)),
      threshold,
      measuring,
      counting,
      at: new Date().toISOString(),
    };

    // need a few high readings in a row - one spike shouldn't kill the server
    consecutive = counting && serverPercent >= threshold ? consecutive + 1 : 0;
    if (consecutive >= breachCount) {
      clearInterval(timer);
      onThresholdExceeded(latest);
    }
  }, intervalMs);

  timer.unref();

  return {
    stop: () => clearInterval(timer),
    getLatest: () => latest,
  };
}

module.exports = { startCpuMonitor };
