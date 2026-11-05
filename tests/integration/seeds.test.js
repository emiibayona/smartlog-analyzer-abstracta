const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const Log = require('../../db/models/log');
const logs = require('../../db/seeds/logs');
const { seedLogs } = require('../../db/seed');

test('seed reruns preserve unrelated and edited records and avoid duplicates', async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI required');
  await mongoose.connect(process.env.MONGODB_URI);
  let model;
  try {
    assert.ok(mongoose.connection.name.endsWith('_test'), 'Must use a test database');
    const collection = `seed_test_${randomUUID().replaceAll('-', '')}`;
    model = mongoose.model(collection, Log.schema, collection);
    await model.create({ microservice: 'synthetic-existing', date: new Date(), level: 'info', message: 'Preserve me' });
    assert.equal((await seedLogs(model)).upsertedCount, 24);
    await model.updateOne({ _id: logs[0]._id }, { $set: { message: 'Edited demo record' } });
    const rerun = await seedLogs(model);
    assert.equal(rerun.upsertedCount, 0);
    assert.equal(await model.countDocuments(), 25);
    assert.equal((await model.findById(logs[0]._id)).message, 'Edited demo record');
    assert.equal(await model.countDocuments({ message: 'Preserve me' }), 1);
  } finally {
    try { if (model) await model.collection.drop(); }
    finally { await mongoose.disconnect(); }
  }
});
