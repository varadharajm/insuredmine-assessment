const ScheduledMessage = require('../models/ScheduledMessage');
const Message = require('../models/Message');

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// supported formats:
//   day  -> 2026-09-23, 23-09-2026, 23/09/2026 or a weekday like "Friday"
//   time -> 18:30, 18:30:15 or 6:30 PM
function buildRunAt(day, time) {
  const t = String(time).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!t) return { error: 'time must look like "18:30", "18:30:00" or "6:30 PM"' };
  let [, h, m, s = '0', ampm] = t;
  h = Number(h);
  if (ampm) {
    if (h < 1 || h > 12) return { error: 'hour must be 1-12 when using AM/PM' };
    h = (h % 12) + (ampm.toLowerCase() === 'pm' ? 12 : 0);
  }
  if (h > 23 || Number(m) > 59 || Number(s) > 59) return { error: 'time is out of range' };

  const d = String(day).trim();
  let year, month, date;

  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = d.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  const weekday = WEEKDAYS.indexOf(d.toLowerCase());

  if (iso) [, year, month, date] = iso.map(Number);
  else if (dmy) [, date, month, year] = dmy.map(Number);
  else if (weekday !== -1) {
    // next friday (or today, if the time hasn't passed yet)
    const now = new Date();
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, Number(m), Number(s));
    let add = (weekday - now.getDay() + 7) % 7;
    if (add === 0 && candidate <= now) add = 7;
    candidate.setDate(candidate.getDate() + add);
    return { runAt: candidate };
  } else return { error: 'day must be "YYYY-MM-DD", "DD-MM-YYYY" or a weekday name like "Friday"' };

  const runAt = new Date(year, month - 1, date, h, Number(m), Number(s));
  if (isNaN(runAt) || runAt.getMonth() !== month - 1) return { error: 'day is not a valid calendar date' };
  return { runAt };
}

// POST /api/messages/schedule
// body: { message, day, time }
async function scheduleMessage(req, res) {
  const { message, day, time } = req.body || {};
  if (!message || !day || !time) {
    return res.status(400).json({ message: 'Body must include "message", "day" and "time"' });
  }
  const { runAt, error } = buildRunAt(day, time);
  if (error) return res.status(400).json({ message: error });
  if (runAt <= new Date()) return res.status(400).json({ message: 'The day and time must be in the future' });

  const job = await ScheduledMessage.create({ message, runAt });
  res.status(201).json({
    message: 'Message scheduled',
    id: job._id,
    runAt: job.runAt,
    runAtLocal: job.runAt.toLocaleString('en-IN', { timeZone: process.env.TZ }),
    status: job.status,
  });
}

// GET /api/messages/scheduled - all jobs with their status
async function listScheduled(req, res) {
  const jobs = await ScheduledMessage.find().sort({ runAt: 1 }).lean();
  res.json(jobs);
}

// GET /api/messages - messages that have actually been inserted
async function listMessages(req, res) {
  const messages = await Message.find().sort({ createdAt: -1 }).lean();
  res.json(messages);
}

module.exports = { scheduleMessage, listScheduled, listMessages, buildRunAt };
