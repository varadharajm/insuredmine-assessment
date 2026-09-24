const { Schema, model } = require('mongoose');

// pending messages. Kept in mongo rather than a setTimeout because the
// server can get restarted by the cpu monitor and timers would be lost.
const scheduledMessageSchema = new Schema(
  {
    message: { type: String, required: true },
    runAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
    insertedMessageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    error: String,
  },
  { timestamps: true }
);

scheduledMessageSchema.index({ status: 1, runAt: 1 });

module.exports = model('ScheduledMessage', scheduledMessageSchema);
