const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
const Log = require('../../db/models/log');
const RejectedLog = require('../../db/models/rejectedLog');
const { ingestLog } = require('../../src/services/logIngestionService');

test('primary and fallback records persist in separate collections', async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const requestId = randomUUID();
  let primaryId;
  try {
    assert.ok(mongoose.connection.name.endsWith('_test'));
    const body = { microservice: 'inventory-service', date: '2026-11-05T12:00:00Z', level: 'info', message: `Synthetic ${requestId}` };
    const primary = await ingestLog({ body, submissionJson: JSON.stringify(body), requestId });
    assert.equal(primary.status, 201);
    primaryId = primary.body.id;
    assert.ok(await Log.findById(primaryId));
    const invalid = { ...body, level: 'invalid', extra: 'synthetic' };
    const fallback = await ingestLog({ body: invalid, submissionJson: JSON.stringify(invalid), requestId });
    assert.equal(fallback.status, 202);
    const stored = await RejectedLog.findById(fallback.body.id);
    assert.deepEqual(JSON.parse(stored.submissionJson), invalid);
    assert.equal(stored.reason, 'validation');
    assert.equal(await Log.countDocuments({ message: body.message }), 1);
  } finally {
    try {
      if (primaryId) await Log.deleteOne({ _id: primaryId });
      if (mongoose.connection.name?.endsWith('_test')) await RejectedLog.deleteMany({ requestId });
    } finally { await mongoose.disconnect(); }
  }
});
