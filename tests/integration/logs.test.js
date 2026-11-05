const request = require('supertest');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../../src/app');
const { listLogs } = require('../../src/services/logService');
const { parseLogQuery } = require('../../src/utils/logQuery');
const { createFixtures } = require('../helpers/logFixtures');
const Log = require('../../db/models/log');

let fixture;
before(async () => { fixture = await createFixtures('integration'); });
after(async () => { if (fixture) await fixture.cleanup(); });

test('service filters actual MongoDB records and serializes public IDs', async () => {
  const result = await listLogs(parseLogQuery({ microservice: fixture.microservice, date: '2026-11-04', level: 'error', message: '[a].*' }));
  assert.equal(result.pagination.total, 2);
  assert.deepEqual(result.data.map((log) => log.id), [fixture.ids[2].toString(), fixture.ids[1].toString()]);
  assert.equal(result.data[0]._id, undefined);
});

test('HTTP endpoint includes day boundaries and excludes the next day', async () => {
  const response = await request(app).get('/api/logs').query({ microservice: fixture.microservice, date: '2026-11-04' });
  assert.equal(response.status, 200);
  assert.equal(response.body.pagination.total, 3);
});

test('readiness pings the real database', async () => {
  const response = await request(app).get('/api/health');
  assert.equal(response.status, 200);
});

test('query indexes exist for default and common filtered ordering', async () => {
  await Log.createIndexes();
  const indexes = await Log.collection.indexes();
  assert.ok(indexes.some(({ key }) => JSON.stringify(key) === JSON.stringify({ date: -1, _id: -1 })));
  assert.ok(indexes.some(({ key }) => JSON.stringify(key) === JSON.stringify({ microservice: 1, level: 1, date: -1, _id: -1 })));
});
