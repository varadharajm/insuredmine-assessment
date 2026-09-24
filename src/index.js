// Entry point (npm start).
//
// Using the cluster module as a tiny process manager:
// primary process just forks one worker that runs the actual server.
// When the worker exits (e.g. the cpu monitor killed it), primary forks
// a new one. So the server restarts itself without needing pm2.
const cluster = require('cluster');

if (cluster.isPrimary) {
  let restarts = 0;
  let shuttingDown = false;

  const startWorker = () => {
    const worker = cluster.fork();
    console.log(`[primary] started worker pid ${worker.process.pid}`);
  };

  cluster.on('exit', (worker, code, signal) => {
    if (shuttingDown) return;
    restarts += 1;
    console.warn(
      `[primary] worker ${worker.process.pid} exited (code ${code}${signal ? `, signal ${signal}` : ''}). ` +
        `Restart #${restarts} in 1s...`
    );
    setTimeout(startWorker, 1000);
  });

  const stopAll = () => {
    shuttingDown = true;
    for (const w of Object.values(cluster.workers)) w.process.kill('SIGTERM');
    setTimeout(() => process.exit(0), 6000).unref();
  };
  process.on('SIGINT', stopAll);
  process.on('SIGTERM', stopAll);

  console.log(`[primary] pid ${process.pid}`);
  startWorker();
} else {
  require('./app')
    .startServer()
    .catch((err) => {
      console.error('[server] failed to start:', err.message);
      process.exit(1);
    });
}
