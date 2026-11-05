const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const mongoose = require('mongoose');
const Log = require('../../db/models/log');
const { aggregateLogs } = require('../../src/services/logAggregationService');
const { seedLogs } = require('../../db/seed');

test('MongoDB aggregation returns verified counts and UTC date boundaries', async (t) => {
  await mongoose.connect(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false });
  const name = `aggregation_${randomUUID().replaceAll('-', '')}_test`;
  let isolated;
  try {
    assert.ok(mongoose.connection.name.endsWith('_test'));
    isolated = mongoose.connection.useDb(name);
    const model = isolated.model('AggregationLog', Log.schema, 'logs');
    await t.test('empty collection returns an empty report', async () => {
      assert.deepEqual(await aggregateLogs({}, 5000, model), { totalLogs: 0, groups: [] });
    });
    await seedLogs(model);
    await t.test('seed dataset has exact totals for all four services and three levels', async () => {
      const result = await aggregateLogs({}, 5000, model);
      const services = ['cycle-counting-service', 'inventory-service', 'replenishment-service', 'slotting-service'];
      const expected = services.flatMap((microservice) => [
        { microservice, level: 'error', count: 2 }, { microservice, level: 'info', count: 3 }, { microservice, level: 'warn', count: 1 },
      ]);
      assert.deepEqual(result, { totalLogs: 24, groups: expected });
    });
    await t.test('date/service/level filters combine and unmatched filters return zero', async () => {
      assert.deepEqual(await aggregateLogs({ microservice: 'inventory-service', level: 'error', from: '2026-11-04', to: '2026-11-04' }, 5000, model), {
        totalLogs: 2, groups: [{ microservice: 'inventory-service', level: 'error', count: 2 }],
      });
      assert.equal((await aggregateLogs({ level: 'warn' }, 5000, model)).totalLogs, 4);
      for (const filters of [{ from: '2026-11-05' }, { to: '2026-11-03' }, { microservice: 'unknown-service' }]) {
        assert.deepEqual(await aggregateLogs(filters, 5000, model), { totalLogs: 0, groups: [] });
      }
    });
    await t.test('range includes exact start/end days and excludes next-day midnight', async () => {
      const boundary = isolated.model('BoundaryLog', Log.schema, 'boundary_logs');
      await boundary.collection.insertMany([
        '2026-11-03T23:59:59.999Z', '2026-11-04T00:00:00Z', '2026-11-04T23:59:59.999Z', '2026-11-05T00:00:00Z',
      ].map((date) => ({ microservice: 'inventory-service', level: 'info', date: new Date(date), message: 'Synthetic boundary' })));
      const before = await boundary.collection.find().sort({ _id: 1 }).toArray();
      assert.equal((await aggregateLogs({ from: '2026-11-04', to: '2026-11-04' }, 5000, boundary)).totalLogs, 2);
      assert.equal((await aggregateLogs({ from: '2026-11-04' }, 5000, boundary)).totalLogs, 3);
      assert.equal((await aggregateLogs({ to: '2026-11-04' }, 5000, boundary)).totalLogs, 3);
      assert.deepEqual(await boundary.collection.find().sort({ _id: 1 }).toArray(), before, 'Aggregation must not mutate documents');
    });
    await t.test('CLI produces JSON results and rejects invalid requests without exposing connection details', async () => {
      const execute = promisify(execFile);
      const uri = process.env.MONGODB_URI.replace(/\/[^/?]*(\?|$)/, `/${name}$1`);
      const options = { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, MONGODB_URI: uri }, timeout: 15000 };
      const valid = await execute(process.execPath, ['db/aggregateLogs.js', '--microservice', 'inventory-service', '--level', 'error'], options);
      assert.equal(JSON.parse(valid.stdout).totalLogs, 2);
      await assert.rejects(execute(process.execPath, ['db/aggregateLogs.js', '--from', '2026-02-30'], options), (error) => {
        assert.equal(error.code, 1); assert.match(error.stderr, /Aggregation failed/); assert.ok(!error.stderr.includes(uri)); return true;
      });
      const help = await execute(process.execPath, ['db/aggregateLogs.js', '--help'], { ...options, env: { ...options.env, MONGODB_URI: '' } });
      assert.match(help.stdout, /Usage:/);
      await assert.rejects(execute(process.execPath, ['db/aggregateLogs.js'], { ...options, env: { ...options.env, MONGODB_URI: '' } }));
      await assert.rejects(execute(process.execPath, ['db/aggregateLogs.js'], { ...options, env: { ...options.env, QUERY_TIMEOUT_MS: '0' } }));
      assert.equal(await model.countDocuments(), 24);
    });
  } finally {
    try { if (isolated) await isolated.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  }
});
