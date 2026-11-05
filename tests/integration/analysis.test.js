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
