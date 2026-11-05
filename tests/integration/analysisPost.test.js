const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../../src/app');
const Log = require('../../db/models/log');
const { Analysis } = require('../../db/models/analysis');
const { createGeminiAnalysisAdapter } = require('../../src/services/geminiAnalysisAdapter');
const { startGeminiStub } = require('../helpers/geminiStub');
const { config, inputLogs } = require('../helpers/analysisEngineFixtures');

test('analysis submissions integrate routing, stored lookup, provider and persistence', async (t) => {
  await mongoose.connect(process.env.MONGODB_URI);
  const stub = await startGeminiStub();
  const requests = [];
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  const marker = randomUUID();
  async function post(path, body) {
    const response = await request(app).post(path).send(body);
    requests.push(response.headers['x-request-id']);
    return response;
  }
  try {
    assert.ok(mongoose.connection.name.endsWith('_test'));
    app.locals.analysisOptions = { config, provider: createGeminiAnalysisAdapter(config, { endpoint: stub.endpoint }) };
    await Log.insertMany(inputLogs().map((log, index) => ({ ...log, _id: ids[index], message: `${log.message} ${marker}` })));
    await t.test('raw analysis creates a completed report but does not insert submitted logs', async () => {
      const rawLogs = inputLogs().map((log) => ({ ...log, message: `Synthetic raw-only ${marker}` }));
      const response = await post('/api/logs/analyze', { logs: rawLogs });
      assert.equal(response.status, 201);
      assert.equal((await Analysis.findById(response.body.id)).status, 'Completed');
      assert.equal(await Log.countDocuments({ message: `Synthetic raw-only ${marker}` }), 0);
    });
    await t.test('stored IDs are read in requested order and saved as evidence', async () => {
      const response = await post('/api/logs/stored/analyze', { ids: ids.map(String).reverse() });
      assert.equal(response.status, 201);
      const stored = await Analysis.findById(response.body.id);
      assert.deepEqual(stored.logIds, ids.map(String).reverse());
      assert.deepEqual(response.body.report.patterns[0].evidenceLogIds, ids.map((id) => `log-${id}`).reverse());
    });
    await t.test('partially missing IDs do not call Gemini or create an analysis', async () => {
      const calls = stub.requests.length;
      const response = await post('/api/logs/stored/analyze', { ids: [String(ids[0]), String(new mongoose.Types.ObjectId())] });
      assert.equal(response.status, 404);
      assert.equal(stub.requests.length, calls);
    });
    await t.test('invalid provider output persists Failed with a queryable ID', async () => {
      stub.setMode('wrong-format');
      const response = await post('/api/logs/analyze', { logs: inputLogs() });
      assert.equal(response.status, 502);
      assert.equal(response.body.code, 'INVALID_RESPONSE');
      const stored = await Analysis.findById(response.body.analysisId);
      assert.equal(stored.status, 'Failed');
      assert.equal(stored.result, undefined);
      stub.setMode('valid');
    });
    await t.test('invalid bodies never reach the provider', async () => {
      const calls = stub.requests.length;
      assert.equal((await post('/api/logs/analyze', { logs: [{ ...inputLogs()[0], id: String(ids[0]) }] })).status, 400);
      assert.equal((await post('/api/logs/stored/analyze', { ids: [String(ids[0]), String(ids[0])] })).status, 400);
      assert.equal(stub.requests.length, calls);
    });
  } finally {
    delete app.locals.analysisOptions;
    try {
      if (mongoose.connection.name?.endsWith('_test')) {
        await Analysis.deleteMany({ requestId: { $in: requests } });
        await Log.deleteMany({ _id: { $in: ids } });
      }
    } finally { await stub.close(); await mongoose.disconnect(); }
  }
});
