const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { analyzeLogs } = require('../../src/services/analysisEngine');
const { createOpenAIAnalysisAdapter } = require('../../src/services/openaiAnalysisAdapter');
const { Analysis } = require('../../db/models/analysis');
const { startOpenAIStub } = require('../helpers/openaiStub');
const { config, inputLogs } = require('../helpers/analysisEngineFixtures');

test('analysis engine integrates the Responses HTTP contract and real MongoDB', async (t) => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const ids = [];
  try {
    assert.ok(mongoose.connection.name.endsWith('_test'));
    for (const [mode, expected] of [['valid', null], ['wrong-format', 'INVALID_RESPONSE'], ['invalid-json', 'INVALID_RESPONSE'], ['malformed-envelope', 'INVALID_RESPONSE'], ['oversized-response', 'INVALID_RESPONSE'], ['refusal', 'PROVIDER_REFUSAL'], ['incomplete', 'INVALID_RESPONSE'], ['timeout', 'PROVIDER_TIMEOUT'], ['http-error', 'PROVIDER_ERROR'], ['http-auth', 'PROVIDER_AUTH'], ['http-rate-limit', 'PROVIDER_RATE_LIMIT']]) {
      await t.test(`${mode} response persists the correct outcome`, async () => {
        const stub = await startOpenAIStub(mode);
        try {
          const testConfig = { ...config, requestTimeoutMs: mode === 'timeout' ? 100 : 2000 };
          const provider = createOpenAIAnalysisAdapter(testConfig, { endpoint: stub.endpoint });
          if (!expected) {
            const result = await analyzeLogs(inputLogs(), { config: testConfig, provider });
            ids.push(result.id);
            const stored = await Analysis.findById(result.id).lean();
            assert.equal(stored.status, 'Completed');
            assert.equal(stored.message, result.report.summary);
            assert.deepEqual(JSON.parse(stored.result), result.report);
            assert.deepEqual(stored.report, result.report);
            assert.deepEqual(stored.levelCounts, { info: 0, warn: 0, error: 2 });
            assert.equal(stored.model, 'test-model');
            assert.equal(stored.mode, 'synthesis');
            assert.equal(stored.logCount, 2);
          } else {
            let failure;
            try { await analyzeLogs(inputLogs(), { config: testConfig, provider }); }
            catch (error) { failure = error; }
            assert.equal(failure?.code, expected);
            ids.push(failure.analysisId);
            const stored = await Analysis.findById(failure.analysisId).lean();
            assert.equal(stored.status, 'Failed');
            assert.equal(stored.errorCode, expected);
            assert.equal(stored.result, undefined);
            assert.equal(stored.report, undefined);
          }
          assert.equal(stub.requests[0].method, 'POST');
          assert.equal(stub.requests[0].url, '/v1/responses');
          assert.equal(stub.requests[0].body.store, false);
          assert.equal(JSON.parse(stub.requests[0].body.input[0].content).mode, 'synthesis');
          assert.equal(stub.requests[0].body.text.format.strict, true);
          assert.equal(stub.requests[0].authorization, 'Bearer synthetic-test-key');
          assert.ok(!JSON.stringify(stub.requests).includes('synthetic-secret'));
        } finally { await stub.close(); }
      });
    }
    await t.test('multi-chunk synthesis persists a combined report and references', async () => {
      const stub = await startOpenAIStub();
      try {
        const testConfig = { ...config, chunkBytes: 240 };
        const result = await analyzeLogs(inputLogs(), { config: testConfig, provider: createOpenAIAnalysisAdapter(testConfig, { endpoint: stub.endpoint }) });
        ids.push(result.id);
        assert.equal(stub.requests.length, 3);
        assert.equal((await Analysis.findById(result.id)).chunkCount, 2);
        assert.deepEqual(result.report.patterns[0].evidenceLogIds, ['input-1', 'input-2']);
      } finally { await stub.close(); }
    });
  } finally {
    try {
      if (mongoose.connection.name?.endsWith('_test')) await Analysis.deleteMany({ _id: { $in: ids.filter(Boolean) } });
    } finally { await mongoose.disconnect(); }
  }
});
