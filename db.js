const mongoose = require('mongoose');

let isConnected = false;

async function connect(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is not set — a MongoDB connection is required.');
  }
  await mongoose.connect(uri, { dbName: process.env.MONGO_DB_NAME || undefined });
  isConnected = true;
  console.log('Connected to MongoDB');
}

function connected() {
  return isConnected;
}

module.exports = { connect, connected, mongoose };
