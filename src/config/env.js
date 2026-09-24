require('dotenv').config({ quiet: true });

// schedule API takes day/time in local time, so fix the TZ (IST by default)
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/insuredmine',
  CPU_THRESHOLD: Number(process.env.CPU_THRESHOLD) || 70, // percent
  CPU_CHECK_INTERVAL_MS: Number(process.env.CPU_CHECK_INTERVAL_MS) || 1000,
  CPU_BREACH_COUNT: Number(process.env.CPU_BREACH_COUNT) || 3, // how many high readings in a row
  CPU_WARMUP_MS: Number(process.env.CPU_WARMUP_MS) || 10000, // startup is always cpu heavy, skip it
  SCHEDULER_POLL_MS: Number(process.env.SCHEDULER_POLL_MS) || 1000,
};
