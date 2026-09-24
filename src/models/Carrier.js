const { Schema, model } = require('mongoose');

// policy carrier (insurance company)
const carrierSchema = new Schema(
  { companyName: { type: String, required: true, unique: true, trim: true } },
  { timestamps: true }
);

module.exports = model('Carrier', carrierSchema);
