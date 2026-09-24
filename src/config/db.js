const mongoose = require('mongoose');

async function connectDB(uri) {
  await mongoose.connect(uri);
  console.log(`[db] connected (pid ${process.pid})`);
  return mongoose.connection;
}

module.exports = { connectDB };
