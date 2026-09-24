const { Schema, model } = require('mongoose');

// agent - just the name
const agentSchema = new Schema(
  { agentName: { type: String, required: true, unique: true, trim: true } },
  { timestamps: true }
);

module.exports = model('Agent', agentSchema);
