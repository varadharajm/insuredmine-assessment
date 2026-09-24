const { Schema, model } = require('mongoose');

// messages land here only when their scheduled time is reached
const messageSchema = new Schema(
  {
    message: { type: String, required: true },
    scheduledFor: Date,
    scheduledMessageId: { type: Schema.Types.ObjectId, ref: 'ScheduledMessage', unique: true, sparse: true },
  },
  { timestamps: true }
);

module.exports = model('Message', messageSchema);
