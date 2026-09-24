const { Schema, model } = require('mongoose');

// policy info - references LOB, carrier and user by _id
const policySchema = new Schema(
  {
    policyNumber: { type: String, required: true, unique: true, trim: true },
    policyStartDate: Date,
    policyEndDate: Date,
    policyCategoryId: { type: Schema.Types.ObjectId, ref: 'LOB' },
    companyId: { type: Schema.Types.ObjectId, ref: 'Carrier' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // not asked for in the task, but handy for search results
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
    accountId: { type: Schema.Types.ObjectId, ref: 'Account' },
    premiumAmount: Number,
  },
  { timestamps: true }
);

module.exports = model('Policy', policySchema);
