const { Schema, model } = require('mongoose');

// policy category / LOB (line of business)
const lobSchema = new Schema(
  { categoryName: { type: String, required: true, unique: true, trim: true } },
  { timestamps: true }
);

module.exports = model('LOB', lobSchema);
