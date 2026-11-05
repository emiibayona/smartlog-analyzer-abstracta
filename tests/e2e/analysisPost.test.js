const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { startAnalysisApi } = require('../helpers/startAnalysisApi');
const { startGeminiStub } = require('../helpers/geminiStub');
const { inputLogs } = require('../helpers/analysisEngineFixtures');
const Log = require('../../db/models/log');
const { Analysis } = require('../../db/models/analysis');

test('analysis POST endpoints work end to end with safe timeouts', { timeout: 90000 }, async (t) => {
  await mongoose.connect(process.env.MONGODB_URI);
  const stub = await startGeminiStub();
  const requestIds = [];
  const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
  let api;
  async function post(path, body, options = {}) {
    const response = await fetch(new URL(path, api.baseUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000), ...options });
    requestIds.push(response.headers.get('x-request-id'));
    return { status: response.status, body: await response.json() };
  }
  async function waitFailed(id) {
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const record = await Analysis.findById(id);
      if (record?.status === 'Failed') return record;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Analysis did not transition to Failed');
  }
  try {
    assert.ok(mongoose.connection.name.endsWith('_test'));
    await Log.insertMany(inputLogs().map((log, index) => ({ ...log, _id: ids[index] })));
    api = await startAnalysisApi(stub.endpoint);
    await t.test('raw and stored successes persist reports retrievable through GET', async () => {
      for (const [path, body] of [['/api/logs/analyze', { logs: inputLogs() }], ['/api/logs/stored/analyze', { ids: ids.map(String).reverse() }]]) {
        const result = await post(path, body);
        assert.equal(result.status, 201);
        assert.equal(result.body.status, 'Completed');
        const response = await fetch(new URL(`/api/analysis/${result.body.id}`, api.baseUrl));
        const record = await response.json();
        assert.equal(record.provider, 'gemini');
        assert.deepEqual(record.report, result.body.report);
      }
    });
    await t.test('minimum and maximum batch counts and multi-chunk synthesis succeed', async () => {
      assert.equal((await post('/api/logs/analyze', { logs: [inputLogs()[0]] })).status, 201);
      const result = await post('/api/logs/analyze', { logs: Array.from({ length: 500 }, () => ({ ...inputLogs()[0], message: 'Synthetic short message' })) });
      assert.equal(result.status, 201);
      const record = await Analysis.findById(result.body.id);
      assert.equal(record.logCount, 500);
      assert.ok(record.chunkCount > 1);
    });
    await t.test('invalid and missing data never calls the provider', async () => {
      const calls = stub.requests.length;
      for (const [path, body, status] of [
        ['/api/logs/analyze', {}, 400], ['/api/logs/analyze', { logs: [] }, 400],
        ['/api/logs/analyze', { logs: Array(501).fill(inputLogs()[0]) }, 400],
        ['/api/logs/analyze', { logs: [{ ...inputLogs()[0], message: ' ' }] }, 400],
        ['/api/logs/analyze', { logs: inputLogs(), extra: true }, 400],
        ['/api/logs/stored/analyze', { ids: [] }, 400], ['/api/logs/stored/analyze', { ids: ['invalid'] }, 400],
        ['/api/logs/stored/analyze', { ids: [String(ids[0]), String(ids[0]).toUpperCase()] }, 400],
        ['/api/logs/stored/analyze', { ids: [String(new mongoose.Types.ObjectId())] }, 404],
        ['/api/logs/stored/analyze', { ids: [String(ids[0]), String(new mongoose.Types.ObjectId())] }, 404],
      ]) assert.equal((await post(path, body)).status, status);
      assert.equal(stub.requests.length, calls);
      assert.equal((await post('/api/logs/analyze?extra=true', { logs: inputLogs() })).status, 400);
      const tooLarge = await post('/api/logs/analyze', { logs: Array(100).fill({ ...inputLogs()[0], message: 'x'.repeat(3000) }) });
      assert.equal(tooLarge.status, 413);
    });
    await t.test('provider failures and timeout return safe errors with persisted Failed records', async () => {
      for (const [mode, status, code] of [['wrong-format', 502, 'INVALID_RESPONSE'], ['refusal', 502, 'PROVIDER_REFUSAL'], ['http-auth', 503, 'PROVIDER_AUTH'], ['http-rate-limit', 503, 'PROVIDER_RATE_LIMIT'], ['http-error', 502, 'PROVIDER_ERROR'], ['timeout', 504, 'PROVIDER_TIMEOUT']]) {
        stub.setMode(mode);
        const result = await post('/api/logs/analyze', { logs: inputLogs() });
        assert.equal(result.status, status);
        assert.equal(result.body.code, code);
        assert.ok(result.body.analysisId);
        assert.equal((await waitFailed(result.body.analysisId)).errorCode, code);
        assert.ok(!JSON.stringify(result.body).includes('synthetic-key'));
      }
      stub.setMode('valid');
    });
    await t.test('database insertion/completion failures never return successful analysis', async () => {
      const collection = mongoose.connection.db;
      await collection.command({ collMod: 'analyses', validator: { logIds: { $nin: [String(ids[0])] } }, validationLevel: 'strict', validationAction: 'error' });
      try {
        const result = await post('/api/logs/stored/analyze', { ids: ids.map(String) });
        assert.equal(result.status, 503);
        assert.equal(result.body.code, 'PERSISTENCE_FAILED');
        assert.equal(result.body.analysisId, undefined);
      } finally { await collection.command({ collMod: 'analyses', validator: {} }); }
      await collection.command({ collMod: 'analyses', validator: { $or: [{ logIds: { $nin: [String(ids[0])] } }, { status: { $ne: 'Completed' } }] }, validationLevel: 'strict', validationAction: 'error' });
      try {
        const result = await post('/api/logs/stored/analyze', { ids: ids.map(String) });
        assert.equal(result.status, 503);
        assert.equal(result.body.code, 'PERSISTENCE_FAILED');
        assert.equal((await waitFailed(result.body.analysisId)).report, undefined);
      } finally { await collection.command({ collMod: 'analyses', validator: {} }); }
    });
    await t.test('missing Gemini configuration returns 503 while root remains healthy', async () => {
      await api.close();
      api = await startAnalysisApi(stub.endpoint, { GEMINI_API_KEY: '' });
      const result = await post('/api/logs/analyze', { logs: inputLogs() });
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'INVALID_CONFIGURATION');
      assert.equal((await fetch(new URL('/api/health', api.baseUrl))).status, 200);
    });
    await t.test('client disconnect cancels provider work and marks its analysis Failed', async () => {
      await api.close();
      api = await startAnalysisApi(stub.endpoint, { ANALYSIS_REQUEST_TIMEOUT_MS: '2000' });
      const disconnectId = new mongoose.Types.ObjectId();
      ids.push(disconnectId);
      await Log.create({ ...inputLogs()[0], _id: disconnectId });
      stub.setMode('timeout');
      const controller = new AbortController();
      const calls = stub.requests.length;
      const cancelled = assert.rejects(fetch(new URL('/api/logs/stored/analyze', api.baseUrl), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [String(disconnectId)] }), signal: controller.signal,
      }));
      const startedBy = Date.now() + 800;
      while (stub.requests.length === calls && Date.now() < startedBy) await new Promise((resolve) => setTimeout(resolve, 10));
      controller.abort();
      await cancelled;
      assert.ok(stub.requests.length > calls, 'Abort only after the provider request has started');
      let record;
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        record = await Analysis.findOne({ logIds: String(disconnectId), status: 'Failed' });
        if (record) break;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.ok(record);
      requestIds.push(record.requestId);
      assert.equal(record.errorCode, 'REQUEST_ABORTED');
    });
    await t.test('HTTP deadline cancels work and persists REQUEST_TIMEOUT instead of leaving it running', async () => {
      await api.close();
      api = await startAnalysisApi(stub.endpoint, { ANALYSIS_HTTP_TIMEOUT_MS: '100', ANALYSIS_REQUEST_TIMEOUT_MS: '2000' });
      stub.setMode('timeout');
      const before = Date.now();
      const result = await post('/api/logs/stored/analyze', { ids: ids.map(String) });
      assert.equal(result.status, 504);
      assert.equal(result.body.code, 'REQUEST_TIMEOUT');
      assert.ok(Date.now() - before < 1500);
      assert.equal((await waitFailed(result.body.analysisId)).errorCode, 'REQUEST_TIMEOUT');
      assert.equal((await fetch(new URL('/api/health', api.baseUrl))).status, 200);
    });
  } finally {
    try {
      if (api) await api.close();
      await stub.close();
      if (mongoose.connection.name?.endsWith('_test')) {
        await Analysis.deleteMany({ requestId: { $in: requestIds.filter(Boolean) } });
        await Log.deleteMany({ _id: { $in: ids } });
      }
    } finally { await mongoose.disconnect(); }
  }
});
