const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createAnalysisFixtures } = require('../helpers/analysisFixtures');
const { Analysis } = require('../../db/models/analysis');
const app = require('../../src/app');

let fixture;
before(async () => { fixture = await createAnalysisFixtures(); });
after(async () => { if (fixture) await fixture.cleanup(); });
test('combined analysis filters query real MongoDB records', async () => {
  const response = await request(app).get('/api/analysis').query({ microservice: fixture.microservice, date: '2026-11-04', status: 'Completed', message: '[a].*' });
  assert.equal(response.status, 200);
  assert.equal(response.body.pagination.total, 2);
  assert.deepEqual(response.body.data.map((entry) => entry.id), [fixture.ids[2].toString(), fixture.ids[1].toString()]);
});
test('analysis date filter includes midnight and excludes the next UTC day', async () => {
  const response = await request(app).get('/api/analysis').query({ microservice: fixture.microservice, date: '2026-11-04' });
  assert.equal(response.body.pagination.total, 3);
});
test('analysis lookup reads the saved result without internal fields', async () => {
  const response = await request(app).get(`/api/analysis/${fixture.ids[1]}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.result, 'Synthetic result one');
  assert.equal(response.body._id, undefined);
  assert.equal(response.body.__v, undefined);
});
test('analysis query indexes are installed', async () => {
  await Analysis.createIndexes();
  const indexes = await Analysis.collection.indexes();
  assert.ok(indexes.some(({ key }) => JSON.stringify(key) === JSON.stringify({ microservice: 1, status: 1, date: -1, _id: -1 })));
});

test('historical reports without categories remain readable and are not rewritten', async () => {
  const legacyReport = {
    summary: 'Historical report',
    patterns: [{ title: 'Legacy timeout', severity: 'warning', description: 'Historical evidence', recommendation: 'Inspect metrics', evidenceLogIds: ['input-1'] }],
    commonIssues: [], insights: [],
  };
  const record = await Analysis.create({ microservice: fixture.microservice, date: new Date('2026-11-04T12:00:00Z'), status: 'Completed',
    report: legacyReport, result: JSON.stringify(legacyReport), message: legacyReport.summary, promptVersion: 'warehouse-logs-v3' });
  fixture.ids.push(record._id);
  const response = await request(app).get(`/api/analysis/${record._id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.report, legacyReport);
  assert.equal(response.body.report.patterns[0].category, undefined);
  const saved = await Analysis.findById(record._id);
  assert.deepEqual(saved.report, legacyReport);
  assert.equal(saved.result, JSON.stringify(legacyReport));
  assert.equal(saved.promptVersion, 'warehouse-logs-v3');
});
