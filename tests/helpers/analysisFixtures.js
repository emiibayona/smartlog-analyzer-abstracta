const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { Analysis } = require('../../db/models/analysis');

async function createAnalysisFixtures() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  if (!mongoose.connection.name.endsWith('_test')) {
    await mongoose.disconnect();
    throw new Error('Analysis tests require a _test database');
  }
  const microservice = `analysis-test-${randomUUID()}`;
  const ids = Array.from({ length: 4 }, () => new mongoose.Types.ObjectId());
  const documents = [
    { _id: ids[0], microservice, date: '2026-11-04T00:00:00Z', status: 'Pending' },
    { _id: ids[1], microservice, date: '2026-11-04T23:59:59.999Z', status: 'Completed', message: 'Synthetic [A].* summary', result: 'Synthetic result one' },
    { _id: ids[2], microservice, date: '2026-11-04T23:59:59.999Z', status: 'Completed', message: 'Synthetic [A].* summary', result: 'Synthetic result two' },
    { _id: ids[3], microservice, date: '2026-11-05T00:00:00Z', status: 'In progress' },
  ];
  async function cleanup() {
    try { await Analysis.deleteMany({ _id: { $in: ids } }); }
    finally { await mongoose.disconnect(); }
  }
  try { await Analysis.insertMany(documents); }
  catch (error) { await cleanup(); throw error; }
  return { microservice, ids, cleanup };
}

module.exports = { createAnalysisFixtures };
