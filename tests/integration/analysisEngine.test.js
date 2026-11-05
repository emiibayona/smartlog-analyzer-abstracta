const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { analyzeLogs } = require('../../src/services/analysisEngine');
const { createGeminiAnalysisAdapter } = require('../../src/services/geminiAnalysisAdapter');
const { Analysis } = require('../../db/models/analysis');
const { startGeminiStub } = require('../helpers/geminiStub');
const { config, inputLogs } = require('../helpers/analysisEngineFixtures');

test('analysis engine integrates the Gemini HTTP contract and real MongoDB', async (t) => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const ids = [];
  try {
    assert.ok(mongoose.connection.name.endsWith('_test'));
    for (const [mode, expected] of [['valid', null], ['multipart', null], ['missing-category', 'INVALID_RESPONSE'], ['invalid-category', 'INVALID_RESPONSE'], ['wrong-format', 'INVALID_RESPONSE'], ['invalid-json', 'INVALID_RESPONSE'], ['malformed-envelope', 'INVALID_RESPONSE'], ['oversized-response', 'INVALID_RESPONSE'], ['refusal', 'PROVIDER_REFUSAL'], ['candidate-block', 'PROVIDER_REFUSAL'], ['empty-candidates', 'INVALID_RESPONSE'], ['multiple-candidates', 'INVALID_RESPONSE'], ['incomplete', 'INVALID_RESPONSE'], ['timeout', 'PROVIDER_TIMEOUT'], ['http-error', 'PROVIDER_ERROR'], ['http-auth', 'PROVIDER_AUTH'], ['http-rate-limit', 'PROVIDER_RATE_LIMIT']]) {
      await t.test(`${mode} response persists the correct outcome`, async () => {
        const stub = await startGeminiStub(mode);
        try {
          const testConfig = { ...config, requestTimeoutMs: mode === 'timeout' ? 100 : 2000 };
          const provider = createGeminiAnalysisAdapter(testConfig, { endpoint: stub.endpoint });
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
            assert.equal(stored.provider, 'gemini');
            assert.equal(stored.mode, 'synthesis');
            assert.equal(stored.logCount, 2);
            assert.equal(stored.report.patterns[0].category, 'latency');
            assert.equal(stored.promptVersion, 'warehouse-logs-v4');
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
          assert.equal(stub.requests[0].url, '/v1beta/models/test-model:generateContent');
          assert.equal(JSON.parse(stub.requests[0].body.contents[0].parts[0].text).mode, 'synthesis');
          assert.equal(stub.requests[0].body.generationConfig.responseMimeType, 'application/json');
          assert.equal(stub.requests[0].body.generationConfig.responseJsonSchema.additionalProperties, false);
          assert.equal(stub.requests[0].body.generationConfig.candidateCount, 1);
          assert.equal(stub.requests[0].body.systemInstruction.parts.length, 1);
          assert.equal(stub.requests[0].apiKey, 'synthetic-test-key');
          assert.ok(!stub.requests[0].url.includes('key='));
          assert.ok(!JSON.stringify(stub.requests).includes('synthetic-secret'));
        } finally { await stub.close(); }
      });
    }
    await t.test('multi-chunk synthesis persists a combined report and references', async () => {
      const stub = await startGeminiStub();
      try {
        const testConfig = { ...config, chunkBytes: 240 };
        const result = await analyzeLogs(inputLogs(), { config: testConfig, provider: createGeminiAnalysisAdapter(testConfig, { endpoint: stub.endpoint }) });
        ids.push(result.id);
        assert.equal(stub.requests.length, 3);
        assert.equal((await Analysis.findById(result.id)).chunkCount, 2);
        assert.deepEqual(result.report.patterns[0].evidenceLogIds, ['input-1', 'input-2']);
        assert.equal(result.report.patterns[0].category, 'latency');
      } finally { await stub.close(); }
    });
  } finally {
    try {
      if (mongoose.connection.name?.endsWith('_test')) await Analysis.deleteMany({ _id: { $in: ids.filter(Boolean) } });
    } finally { await mongoose.disconnect(); }
  }
});
