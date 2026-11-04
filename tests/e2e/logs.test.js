const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFixtures } = require('../helpers/logFixtures');

test('GET /api/logs through the running API and MongoDB', async (t) => {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) throw new Error('API_BASE_URL is required for E2E tests');
  const fixture = await createFixtures('e2e');
  async function get(query) {
    const url = new URL('/api/logs', baseUrl);
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    return { status: response.status, body: await response.json() };
  }
  try {
    await t.test('combined filters return only matching logs', async () => {
      const response = await get({ microservice: fixture.microservice, date: '2026-11-04', level: 'error', message: '[a].*' });
      assert.equal(response.status, 200);
      assert.equal(response.body.pagination.total, 2);
      assert.deepEqual(response.body.data.map((log) => log.id), [fixture.ids[2].toString(), fixture.ids[1].toString()]);
    });
    await t.test('pagination is stable across equal timestamps', async () => {
      const first = await get({ microservice: fixture.microservice, limit: '2' });
      const second = await get({ microservice: fixture.microservice, limit: '2', page: '2' });
      assert.deepEqual(first.body.pagination, { page: 1, limit: 2, total: 4, totalPages: 2 });
      assert.deepEqual([...first.body.data, ...second.body.data].map((log) => log.id), [...fixture.ids].reverse().map(String));
    });
    await t.test('empty matches and out-of-range pages return empty data', async () => {
      const empty = await get({ microservice: fixture.microservice, message: 'no-such-synthetic-message' });
      assert.equal(empty.status, 200);
      assert.deepEqual(empty.body.data, []);
      assert.equal(empty.body.pagination.totalPages, 0);
      const beyond = await get({ microservice: fixture.microservice, page: '10' });
      assert.deepEqual(beyond.body.data, []);
      assert.equal(beyond.body.pagination.total, 4);
    });
    await t.test('invalid and repeated query parameters return JSON 400', async () => {
      for (const query of [{ date: '2026-02-30' }, { limit: '101' }, { page: '0' }, { level: 'invalid' }]) {
        const response = await get(query);
        assert.equal(response.status, 400);
        assert.equal(typeof response.body.error, 'string');
      }
      const response = await fetch(new URL('/api/logs?level=info&level=error', baseUrl));
      assert.equal(response.status, 400);
    });
  } finally { await fixture.cleanup(); }
});
