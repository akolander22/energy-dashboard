const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongo:27017/energy';

let connected = false;

async function connect() {
  if (connected) return;
  await mongoose.connect(MONGO_URI);
  connected = true;
  console.log(`[DB] Connected to MongoDB at ${MONGO_URI}`);
}

mongoose.connection.on('disconnected', () => {
  connected = false;
  console.warn('[DB] MongoDB disconnected — will retry on next request');
});

module.exports = { connect };
