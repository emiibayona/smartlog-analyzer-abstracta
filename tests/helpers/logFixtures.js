const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const Log = require('../../db/models/log');

async function createFixtures(prefix) {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for database tests');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  if (!mongoose.connection.name.endsWith('_test')) {
    await mongoose.disconnect();
    throw new Error('Database tests require a database name ending in _test');
  }
  const microservice = `${prefix}-${randomUUID()}`;
  const ids = [1, 2, 3, 4].map(() => new mongoose.Types.ObjectId());
  try {
    await Log.insertMany([
      { _id: ids[0], microservice, date: '2026-11-04T00:00:00Z', level: 'info', message: 'Ready' },
      { _id: ids[1], microservice, date: '2026-11-04T23:59:59.999Z', level: 'error', message: 'Synthetic [A].* timeout' },
      { _id: ids[2], microservice, date: '2026-11-04T23:59:59.999Z', level: 'error', message: 'Synthetic [A].* retry' },
      { _id: ids[3], microservice, date: '2026-11-05T00:00:00Z', level: 'warn', message: 'Recovered' },
    ]);
  } catch (error) {
    try { await Log.deleteMany({ _id: { $in: ids } }); }
    finally { await mongoose.disconnect(); }
    throw error;
  }
  return {
    microservice, ids,
    async cleanup() {
      try { await Log.deleteMany({ _id: { $in: ids } }); }
      finally { await mongoose.disconnect(); }
    },
  };
}

module.exports = { createFixtures };
