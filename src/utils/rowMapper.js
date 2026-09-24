// Maps a raw csv/xlsx row to the fields we need.
// Header names are compared after lowercasing and stripping spaces/underscores,
// so "first_name", "First Name" and "firstname" are all the same thing.

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// our field name -> header names we accept for it
const ALIASES = {
  agent: ['agent', 'agentname'],
  userType: ['usertype'],
  policyNumber: ['policynumber', 'policyno'],
  premiumAmount: ['premiumamount'],
  companyName: ['companyname', 'carrier', 'carriername'],
  categoryName: ['categoryname', 'lob', 'policycategory'],
  policyStartDate: ['policystartdate', 'startdate'],
  policyEndDate: ['policyenddate', 'enddate'],
  accountName: ['accountname'],
  email: ['email', 'emailid'],
  gender: ['gender'],
  firstName: ['firstname', 'name', 'username'],
  phone: ['phone', 'phonenumber', 'mobile'],
  address: ['address'],
  state: ['state'],
  zip: ['zip', 'zipcode', 'pincode'],
  dob: ['dob', 'dateofbirth'],
};

function buildHeaderMap(headers) {
  const map = {};
  const normalised = headers.map((h) => [h, norm(h)]);
  for (const [field, names] of Object.entries(ALIASES)) {
    const hit = normalised.find(([, n]) => names.includes(n));
    if (hit) map[field] = hit[0];
  }
  return map;
}

const clean = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
};

// handles Date objects, excel serial numbers, MM/DD/YYYY and ISO strings
function toDate(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (v instanceof Date) return isNaN(v) ? undefined : v;
  if (typeof v === 'number') {
    // excel stores dates as days since 1899-12-30
    return new Date(Math.round((v - 25569) * 86400 * 1000));
  }
  const s = String(v).trim();
  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (mdy) {
    let [, m, d, y] = mdy.map(Number);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return isNaN(dt) ? undefined : dt;
  }
  const dt = new Date(s);
  return isNaN(dt) ? undefined : dt;
}

function mapRow(row, headerMap) {
  const get = (field) => (headerMap[field] ? row[headerMap[field]] : undefined);
  const premium = Number(String(get('premiumAmount') ?? '').replace(/[^0-9.-]/g, ''));
  return {
    agent: clean(get('agent')),
    userType: clean(get('userType')),
    policyNumber: clean(get('policyNumber')),
    premiumAmount: Number.isFinite(premium) && String(get('premiumAmount') ?? '').trim() !== '' ? premium : undefined,
    companyName: clean(get('companyName')),
    categoryName: clean(get('categoryName')),
    policyStartDate: toDate(get('policyStartDate')),
    policyEndDate: toDate(get('policyEndDate')),
    accountName: clean(get('accountName')),
    email: clean(get('email'))?.toLowerCase(),
    gender: clean(get('gender')),
    firstName: clean(get('firstName')),
    phone: clean(get('phone')),
    address: clean(get('address')),
    state: clean(get('state')),
    zip: clean(get('zip')),
    dob: toDate(get('dob')),
  };
}

module.exports = { buildHeaderMap, mapRow, toDate };
