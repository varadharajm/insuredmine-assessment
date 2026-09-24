// Every second: find scheduled messages that are due and insert them into
// the messages collection. Since jobs are in the db, a restart doesn't lose
// anything - overdue ones just get picked up on the next tick.
const ScheduledMessage = require('../models/ScheduledMessage');
const Message = require('../models/Message');

async function processDueMessages() {
  // findOneAndUpdate is atomic, so if two instances run this at the same
  // time they can't both grab the same job
  for (;;) {
    const job = await ScheduledMessage.findOneAndUpdate(
      { status: 'pending', runAt: { $lte: new Date() } },
      { $set: { status: 'processing' } },
      { sort: { runAt: 1 }, returnDocument: 'after' }
    );
    if (!job) return;

    try {
      const inserted = await Message.create({
        message: job.message,
        scheduledFor: job.runAt,
        scheduledMessageId: job._id,
      });
      job.status = 'done';
      job.insertedMessageId = inserted._id;
      console.log(`[scheduler] inserted message ${inserted._id} (scheduled for ${job.runAt.toISOString()})`);
    } catch (err) {
      job.status = 'failed';
      job.error = err.message;
    }
    await job.save();
  }
}

function startScheduler({ pollMs }) {
  let running = false;

  // if we crashed mid-job last time, put it back in the queue
  ScheduledMessage.updateMany({ status: 'processing', insertedMessageId: null }, { $set: { status: 'pending' } }).catch(
    () => {}
  );

  const timer = setInterval(async () => {
    if (running) return; // previous tick still going
    running = true;
    try {
      await processDueMessages();
    } catch (err) {
      console.error('[scheduler] error:', err.message);
    } finally {
      running = false;
    }
  }, pollMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}

module.exports = { startScheduler, processDueMessages };
