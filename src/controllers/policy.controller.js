const User = require('../models/User');
const Policy = require('../models/Policy');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// joins used by both endpoints - pulls in the names behind the ids
const policyLookups = [
  { $lookup: { from: 'lobs', localField: 'policyCategoryId', foreignField: '_id', as: 'category' } },
  { $lookup: { from: 'carriers', localField: 'companyId', foreignField: '_id', as: 'carrier' } },
  { $lookup: { from: 'agents', localField: 'agentId', foreignField: '_id', as: 'agent' } },
  { $lookup: { from: 'accounts', localField: 'accountId', foreignField: '_id', as: 'account' } },
];

// GET /api/policies/search?username=Lura
// case-insensitive, partial match on first name
async function searchByUsername(req, res) {
  const username = (req.query.username || '').trim();
  if (!username) return res.status(400).json({ message: 'Query parameter "username" is required' });

  const users = await User.find({ firstName: { $regex: escapeRegex(username), $options: 'i' } }).lean();
  if (users.length === 0) return res.status(404).json({ message: `No user found matching "${username}"` });

  const policies = await Policy.aggregate([
    { $match: { userId: { $in: users.map((u) => u._id) } } },
    ...policyLookups,
    {
      $project: {
        _id: 0,
        policyId: '$_id',
        policyNumber: 1,
        policyStartDate: 1,
        policyEndDate: 1,
        premiumAmount: 1,
        userId: 1,
        category: { $first: '$category.categoryName' },
        carrier: { $first: '$carrier.companyName' },
        agent: { $first: '$agent.agentName' },
        account: { $first: '$account.accountName' },
      },
    },
    { $sort: { policyStartDate: -1 } },
  ]);

  const result = users.map((u) => ({
    user: { id: u._id, firstName: u.firstName, email: u.email, phoneNumber: u.phoneNumber, userType: u.userType },
    policies: policies.filter((p) => String(p.userId) === String(u._id)).map(({ userId, ...p }) => p),
  }));

  res.json({ count: policies.length, users: result });
}

// GET /api/policies/aggregate
// per user: policy count, total premium and the list of policies
async function aggregateByUser(req, res) {
  const data = await Policy.aggregate([
    ...policyLookups,
    {
      $group: {
        _id: '$userId',
        totalPolicies: { $sum: 1 },
        totalPremium: { $sum: { $ifNull: ['$premiumAmount', 0] } },
        policies: {
          $push: {
            policyNumber: '$policyNumber',
            policyStartDate: '$policyStartDate',
            policyEndDate: '$policyEndDate',
            premiumAmount: '$premiumAmount',
            category: { $first: '$category.categoryName' },
            carrier: { $first: '$carrier.companyName' },
          },
        },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        firstName: '$user.firstName',
        email: '$user.email',
        totalPolicies: 1,
        totalPremium: { $round: ['$totalPremium', 2] },
        policies: 1,
      },
    },
    { $sort: { totalPolicies: -1, firstName: 1 } },
  ]);

  res.json({ users: data.length, data });
}

module.exports = { searchByUsername, aggregateByUser };
