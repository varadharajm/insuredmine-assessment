// Runs in its own thread so parsing + inserting a big file doesn't
// block the main event loop (API stays responsive during an upload).
const { parentPort, workerData } = require('worker_threads');
const XLSX = require('xlsx');
const mongoose = require('mongoose');

const Agent = require('../models/Agent');
const User = require('../models/User');
const Account = require('../models/Account');
const LOB = require('../models/LOB');
const Carrier = require('../models/Carrier');
const Policy = require('../models/Policy');
const { buildHeaderMap, mapRow } = require('../utils/rowMapper');

// upsert unique values, then return a map of value -> _id
async function upsertAndMap(Model, keyField, docsByKey) {
  if (docsByKey.size === 0) return new Map();
  const ops = [...docsByKey.entries()].map(([key, doc]) => ({
    updateOne: { filter: { [keyField]: key }, update: { $set: doc }, upsert: true },
  }));
  await Model.bulkWrite(ops, { ordered: false });
  const saved = await Model.find({ [keyField]: { $in: [...docsByKey.keys()] } }, { [keyField]: 1 }).lean();
  return new Map(saved.map((d) => [d[keyField], d._id]));
}

async function run() {
  const { filePath, mongoUri } = workerData;
  await mongoose.connect(mongoUri);

  // make sure db indexes match the schemas (I changed the user index once,
  // an old unique index on email would break the upsert)
  for (const Model of [Agent, User, Account, LOB, Carrier, Policy]) await Model.syncIndexes();

  // 1. read the file - xlsx lib handles csv too.
  // for csv keep cells as plain text so dates aren't guessed by the lib
  const isCsv = filePath.toLowerCase().endsWith('.csv') || workerData.originalName?.toLowerCase().endsWith('.csv');
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: isCsv });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
  if (rawRows.length === 0) throw new Error('The uploaded file has no data rows');

  const headerMap = buildHeaderMap(Object.keys(rawRows[0]));
  const rows = rawRows.map((r) => mapRow(r, headerMap));

  // 2. collect unique agents / categories / carriers / users
  const agents = new Map();
  const lobs = new Map();
  const carriers = new Map();
  const users = new Map();
  const skipped = [];

  // user = name + email (see User model), or name + phone if no email
  const userKey = (r) => (r.email ? `${r.firstName}|${r.email}` : `${r.firstName}|phone:${r.phone || ''}`);

  rows.forEach((r, i) => {
    if (!r.policyNumber || !r.firstName) {
      skipped.push({ row: i + 2, reason: 'missing policy number or first name' }); // +2 for header row
      return;
    }
    if (r.agent) agents.set(r.agent, { agentName: r.agent });
    if (r.categoryName) lobs.set(r.categoryName, { categoryName: r.categoryName });
    if (r.companyName) carriers.set(r.companyName, { companyName: r.companyName });
    users.set(userKey(r), {
      firstName: r.firstName,
      dob: r.dob,
      address: r.address,
      phoneNumber: r.phone,
      state: r.state,
      zipCode: r.zip,
      email: r.email,
      gender: r.gender,
      userType: r.userType,
    });
  });

  // 3. save the lookup collections first, we need their _ids for policies
  const [agentIds, lobIds, carrierIds] = await Promise.all([
    upsertAndMap(Agent, 'agentName', agents),
    upsertAndMap(LOB, 'categoryName', lobs),
    upsertAndMap(Carrier, 'companyName', carriers),
  ]);

  const userIds = new Map();
  const userOps = [...users.entries()].map(([key, doc]) => {
    const filter = doc.email
      ? { firstName: doc.firstName, email: doc.email }
      : { firstName: doc.firstName, phoneNumber: doc.phoneNumber };
    const clean = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
    return { key, filter, op: { updateOne: { filter, update: { $set: clean }, upsert: true } } };
  });
  if (userOps.length) {
    await User.bulkWrite(userOps.map((u) => u.op), { ordered: false });
    // read all the ids back in one query instead of one per user
    const saved = await User.find({ $or: userOps.map((u) => u.filter) }, { email: 1, firstName: 1, phoneNumber: 1 }).lean();
    const byNameEmail = new Map(saved.filter((s) => s.email).map((s) => [`${s.firstName}|${s.email}`, s._id]));
    const byNamePhone = new Map(saved.map((s) => [`${s.firstName}|phone:${s.phoneNumber || ''}`, s._id]));
    for (const u of userOps) {
      userIds.set(u.key, (u.filter.email ? byNameEmail : byNamePhone).get(u.key));
    }
  }

  // 4. accounts (needs userId)
  const accountOps = new Map();
  rows.forEach((r) => {
    if (!r.policyNumber || !r.firstName || !r.accountName) return;
    const userId = userIds.get(userKey(r));
    accountOps.set(`${r.accountName}|${userId}`, { accountName: r.accountName, userId });
  });
  const accountIds = new Map();
  if (accountOps.size) {
    await Account.bulkWrite(
      [...accountOps.values()].map((a) => ({
        updateOne: { filter: a, update: { $set: a }, upsert: true },
      })),
      { ordered: false }
    );
    const saved = await Account.find({ $or: [...accountOps.values()] }).lean();
    saved.forEach((a) => accountIds.set(`${a.accountName}|${a.userId}`, a._id));
  }

  // 5. policies - link everything by _id
  const policyOps = [];
  rows.forEach((r) => {
    if (!r.policyNumber || !r.firstName) return;
    const userId = userIds.get(userKey(r));
    const doc = {
      policyNumber: r.policyNumber,
      policyStartDate: r.policyStartDate,
      policyEndDate: r.policyEndDate,
      policyCategoryId: lobIds.get(r.categoryName),
      companyId: carrierIds.get(r.companyName),
      userId,
      agentId: agentIds.get(r.agent),
      accountId: accountIds.get(`${r.accountName}|${userId}`),
      premiumAmount: r.premiumAmount,
    };
    const clean = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== undefined));
    policyOps.push({ updateOne: { filter: { policyNumber: r.policyNumber }, update: { $set: clean }, upsert: true } });
  });
  if (policyOps.length) await Policy.bulkWrite(policyOps, { ordered: false });

  await mongoose.disconnect();

  return {
    totalRows: rawRows.length,
    imported: policyOps.length,
    skipped,
    counts: {
      agents: agents.size,
      users: users.size,
      accounts: accountOps.size,
      lobs: lobs.size,
      carriers: carriers.size,
      policies: policyOps.length,
    },
    unmatchedHeaders: Object.keys(rawRows[0]).filter((h) => !Object.values(headerMap).includes(h)),
  };
}

run()
  .then((result) => parentPort.postMessage({ ok: true, result }))
  .catch(async (err) => {
    await mongoose.disconnect().catch(() => {});
    parentPort.postMessage({ ok: false, error: err.message });
  });
