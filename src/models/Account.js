const { Schema, model } = require('mongoose');

// user's account (account name + which user it belongs to)
const accountSchema = new Schema(
  {
    accountName: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

accountSchema.index({ accountName: 1, userId: 1 }, { unique: true });

module.exports = model('Account', accountSchema);
