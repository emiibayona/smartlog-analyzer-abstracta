const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const Log = require('../../db/models/log');
const RejectedLog = require('../../db/models/rejectedLog');

test('POST /api/logs validates and preserves submissions through the isolated API', async (t) => {
  if (!process.env.API_BASE_URL || !process.env.MONGODB_URI) throw new Error('Test API and database configuration required');
  await mongoose.connect(process.env.MONGODB_URI);
  const marker = `Synthetic ingestion ${randomUUID()}`;
  const requestIds = [];
  const primaryIds = [];
  const body = { microservice: 'inventory-service', date: '2026-11-05T12:00:00.000Z', level: 'info', message: marker };
  async function post(value, { type = 'application/json', raw = false } = {}) {
    const response = await fetch(new URL('/api/logs', process.env.API_BASE_URL), {
      method: 'POST', headers: { 'Content-Type': type }, body: raw ? value : JSON.stringify(value), signal: AbortSignal.timeout(15000),
    });
    if (response.headers.get('x-request-id')) requestIds.push(response.headers.get('x-request-id'));
    const result = await response.json();
    if (response.status === 201) primaryIds.push(result.id);
    return { status: response.status, body: result };
  }
  try {
    assert.ok(mongoose.connection.name.endsWith('_test'));
    await t.test('happy path persists all fields and is retrievable through GET', async () => {
      const result = await post({ ...body, payload: 'files/synthetic.log' });
      assert.equal(result.status, 201);
      assert.equal(result.body.message, marker);
      assert.equal(result.body.date, body.date);
      const saved = await Log.findById(result.body.id);
      assert.equal(saved.payload, 'files/synthetic.log');
      const url = new URL('/api/logs', process.env.API_BASE_URL);
      url.search = new URLSearchParams({ message: marker }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      assert.ok((await response.json()).data.some((entry) => entry.id === result.body.id));
    });
    await t.test('all allowed services and levels are accepted', async () => {
      for (const microservice of ['inventory-service', 'replenishment-service', 'cycle-counting-service', 'slotting-service']) {
        for (const level of ['info', 'warn', 'error']) assert.equal((await post({ ...body, microservice, level })).status, 201);
      }
    });
    await t.test('exact length boundaries and timezone timestamps are accepted', async () => {
      const result = await post({ ...body, message: 'x'.repeat(16384), payload: 'x'.repeat(4096), date: '2026-11-05T09:00:00-03:00' });
      assert.equal(result.status, 201);
      assert.equal(result.body.date, body.date);
    });
    await t.test('invalid readable bodies are preserved in fallback and never accepted as valid logs', async () => {
      for (const invalid of [null, [], {}, { ...body, microservice: 'unknown' }, { ...body, level: 'DEBUG' }, { ...body, message: ' ' }, { ...body, date: '2026-02-30T00:00:00Z' }, { ...body, date: '2026-11-05' }, { ...body, payload: {} }, { ...body, message: 'x'.repeat(16385) }, { ...body, payload: 'x'.repeat(4097) }, { ...body, extra: { '$value': 'synthetic' } }]) {
        const result = await post(invalid);
        assert.equal(result.status, 202);
        assert.equal(result.body.reason, 'validation');
        assert.ok(result.body.issues.length);
        const stored = await RejectedLog.findById(result.body.id);
        assert.deepEqual(JSON.parse(stored.submissionJson), invalid);
        assert.equal(await Log.countDocuments({ _id: stored._id }), 0);
      }
    });
    await t.test('a real primary write failure is preserved in fallback; failure of both writes returns 503', async () => {
      const failedBody = { ...body, message: `${marker} rejected-by-test-validator` };
      // Deny only this test's unique submission; other fixtures and existing data remain valid.
      await mongoose.connection.db.command({ collMod: 'logs', validator: { message: { $ne: failedBody.message } }, validationLevel: 'strict', validationAction: 'error' });
      try {
        const quarantined = await post(failedBody);
        assert.equal(quarantined.status, 202);
        assert.equal(quarantined.body.reason, 'primary_write');
        const stored = await RejectedLog.findById(quarantined.body.id);
        assert.deepEqual(JSON.parse(stored.submissionJson), failedBody);
        assert.ok(stored.primaryLogId);
        assert.equal(await Log.countDocuments({ message: failedBody.message }), 0);
        await mongoose.connection.db.command({ collMod: 'rejected_logs', validator: { submissionJson: { $ne: JSON.stringify(failedBody) } }, validationLevel: 'strict', validationAction: 'error' });
        try {
          const unavailable = await post(failedBody);
          assert.equal(unavailable.status, 503);
          assert.match(unavailable.body.error, /retry/);
          assert.equal(await RejectedLog.countDocuments({ submissionJson: JSON.stringify(failedBody) }), 1);
        } finally {
          await mongoose.connection.db.command({ collMod: 'rejected_logs', validator: {} });
        }
      } finally {
        await mongoose.connection.db.command({ collMod: 'logs', validator: {} });
      }
    });
    await t.test('malformed, missing, oversized, and non-JSON requests have controlled errors', async () => {
      for (const [value, type, status] of [['{invalid', 'application/json', 400], ['', 'application/json', 400], ['{}', 'text/plain', 415], ['{}', 'application/json; charset=iso-8859-1', 415], [JSON.stringify({ message: 'x'.repeat(65536) }), 'application/json', 413]]) {
        const result = await post(value, { type, raw: true });
        assert.equal(result.status, status);
        assert.equal(typeof result.body.error, 'string');
      }
    });
    await t.test('v2 fallback-management endpoints are not implemented', async () => {
      const response = await fetch(new URL('/api/rejected-logs', process.env.API_BASE_URL), { signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, 404);
    });
  } finally {
    try {
      if (mongoose.connection.name?.endsWith('_test')) {
        await Log.deleteMany({ _id: { $in: primaryIds } });
        await RejectedLog.deleteMany({ requestId: { $in: requestIds } });
      }
    } finally { await mongoose.disconnect(); }
  }
});
