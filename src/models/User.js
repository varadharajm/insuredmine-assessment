const { Schema, model } = require('mongoose');

// user details from the sheet
const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, index: true },
    dob: Date,
    address: String,
    phoneNumber: String,
    state: String,
    zipCode: String,
    email: { type: String, lowercase: true, trim: true, index: true },
    gender: String,
    userType: String,
  },
  { timestamps: true }
);

// the sample sheet has ~47 emails shared by two different people,
// so email alone isn't unique - using name + email instead
userSchema.index({ firstName: 1, email: 1 }, { unique: true });

module.exports = model('User', userSchema);
