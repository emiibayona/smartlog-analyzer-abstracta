const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { createAnalysisFixtures } = require('../helpers/analysisFixtures');

test('analysis GET endpoints through the isolated API and database', async (t) => {
  if (!process.env.API_BASE_URL) throw new Error('API_BASE_URL required');
  const fixture = await createAnalysisFixtures();
  async function get(path = '/api/analysis', query = {}) {
    const url = new URL(path, process.env.API_BASE_URL);
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await response.json() };
  }
  try {
    await t.test('combined filters return matching completed analyses', async () => {
      const result = await get('/api/analysis/', { microservice: fixture.microservice, status: 'Completed', date: '2026-11-04', message: '[a].*' });
      assert.equal(result.status, 200);
      assert.equal(result.body.pagination.total, 2);
      assert.deepEqual(result.body.data.map((a) => a.id), [fixture.ids[2].toString(), fixture.ids[1].toString()]);
    });
    await t.test('pagination has deterministic ties and default limits', async () => {
      const defaults = await get('/api/analysis', { microservice: fixture.microservice });
      assert.deepEqual(defaults.body.pagination, { page: 1, limit: 20, total: 4, totalPages: 1 });
      const first = await get('/api/analysis', { microservice: fixture.microservice, limit: '2' });
      const second = await get('/api/analysis', { microservice: fixture.microservice, limit: '2', page: '2' });
      assert.deepEqual([...first.body.data, ...second.body.data].map((a) => a.id), [...fixture.ids].reverse().map(String));
      const max = await get('/api/analysis', { microservice: fixture.microservice, limit: '100' });
      assert.equal(max.status, 200);
    });
    await t.test('empty and out-of-range results return 200', async () => {
      const empty = await get('/api/analysis', { microservice: fixture.microservice, message: 'nonexistent-fixture-message' });
      assert.equal(empty.status, 200);
      assert.equal(empty.body.pagination.totalPages, 0);
      assert.deepEqual(empty.body.data, []);
      const beyond = await get('/api/analysis', { microservice: fixture.microservice, page: '999' });
      assert.deepEqual(beyond.body.data, []);
      assert.equal(beyond.body.pagination.total, 4);
    });
    await t.test('all statuses can be retrieved, including pending without a result', async () => {
      for (const [index, status] of [[0, 'Pending'], [1, 'Completed'], [3, 'In progress']]) {
        const result = await get(`/api/analysis/${fixture.ids[index]}`);
        assert.equal(result.status, 200);
        assert.equal(result.body.status, status);
        assert.equal(result.body.id, fixture.ids[index].toString());
        assert.equal(result.body._id, undefined);
      }
      const uppercase = await get(`/api/analysis/${fixture.ids[1].toString().toUpperCase()}`);
      assert.equal(uppercase.status, 200);
    });
    await t.test('bad queries and malformed IDs return JSON 400', async () => {
      for (const query of [{ status: 'completed' }, { status: '' }, { level: 'error' }, { date: '2026-02-30' }, { page: '0' }, { limit: '101' }, { message: 'x'.repeat(501) }, { extra: 'x' }]) {
        const response = await get('/api/analysis', query);
        assert.equal(response.status, 400);
        assert.equal(typeof response.body.error, 'string');
      }
      for (const id of ['bad-id', 'g'.repeat(24), 'a'.repeat(25)]) assert.equal((await get(`/api/analysis/${id}`)).status, 400);
      assert.equal((await get(`/api/analysis/${fixture.ids[0]}`, { page: '1' })).status, 400);
      const repeated = await fetch(new URL('/api/analysis?status=Pending&status=Completed', process.env.API_BASE_URL), { signal: AbortSignal.timeout(10000) });
      assert.equal(repeated.status, 400);
    });
    await t.test('well-formed missing IDs return JSON 404', async () => {
      const result = await get(`/api/analysis/${new mongoose.Types.ObjectId()}`);
      assert.equal(result.status, 404);
      assert.deepEqual(result.body, { error: 'Analysis not found' });
    });
  } finally { await fixture.cleanup(); }
});
