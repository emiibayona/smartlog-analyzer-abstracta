const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { MongoClient } = require('mongoose').mongo;
const { runMigrations } = require('../../db/migrate');
const Log = require('../../db/models/log');
const { Analysis } = require('../../db/models/analysis');
const RejectedLog = require('../../db/models/rejectedLog');

test('versioned migrations initialize, rerun, and recover safely with real MongoDB', async (t) => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const name = `migration_${randomUUID().replaceAll('-', '')}_test`;
  const db = client.db(name);
  try {
    assert.ok(client.db().databaseName.endsWith('_test'), 'Require an isolated test connection');
    await t.test('fresh database receives all collections and indexes with one history record', async () => {
      assert.deepEqual(await runMigrations(db), { applied: ['001-initial-collections'], skipped: [] });
      const names = (await db.listCollections().toArray()).map((item) => item.name);
      for (const collection of ['logs', 'analyses', 'rejected_logs', 'schema_migrations']) assert.ok(names.includes(collection));
      for (const [collection, count] of [['logs', 5], ['analyses', 5], ['rejected_logs', 3]]) {
        assert.equal((await db.collection(collection).indexes()).length, count);
      }
      for (const [collection, model] of [['logs', Log], ['analyses', Analysis], ['rejected_logs', RejectedLog]]) {
        const actual = await db.collection(collection).indexes();
        for (const [key] of model.schema.indexes()) {
          assert.ok(actual.some((index) => JSON.stringify(index.key) === JSON.stringify(key)), `${collection} must have the model's query indexes`);
        }
      }
      const record = await db.collection('schema_migrations').findOne({ _id: '001-initial-collections' });
      assert.ok(record.appliedAt instanceof Date);
    });
    await t.test('reruns preserve application data, custom indexes, and the original completion time', async () => {
      const original = await db.collection('schema_migrations').findOne({ _id: '001-initial-collections' });
      await db.collection('logs').insertOne({ message: 'Synthetic pre-existing record' });
      await db.collection('logs').createIndex({ message: 1 }, { name: 'custom_test_index' });
      assert.deepEqual(await runMigrations(db), { applied: [], skipped: ['001-initial-collections'] });
      assert.equal(await db.collection('logs').countDocuments(), 1);
      assert.ok((await db.collection('logs').indexes()).some((index) => index.name === 'custom_test_index'));
      assert.equal((await db.collection('schema_migrations').findOne({ _id: original._id })).appliedAt.getTime(), original.appliedAt.getTime());
      assert.equal(await db.collection('schema_migrations').countDocuments(), 1);
    });
    await t.test('unrecorded existing/partially initialized databases can finish the migration', async () => {
      // Only remove the synthetic history marker in this temporary test database.
      await db.collection('schema_migrations').deleteOne({ _id: '001-initial-collections' });
      const result = await runMigrations(db);
      assert.equal(result.applied.length, 1);
      assert.equal(await db.collection('logs').countDocuments(), 1);
    });
    await t.test('a failed DDL step is not recorded and can be retried', async () => {
      const id = '002-recovery-test';
      let fail = true;
      const migration = { id, async up(database) {
        await database.collection('recovery_fixture').updateOne({ _id: 'synthetic' }, { $setOnInsert: { message: 'keep me' } }, { upsert: true });
        if (fail) throw new Error('synthetic failure');
        await database.collection('recovery_fixture').createIndex({ message: 1 });
      } };
      await assert.rejects(runMigrations(db, [migration]), /synthetic failure/);
      assert.equal(await db.collection('schema_migrations').findOne({ _id: id }), null);
      fail = false;
      assert.deepEqual((await runMigrations(db, [migration])).applied, [id]);
      assert.equal(await db.collection('recovery_fixture').countDocuments(), 1);
    });
  } finally {
    try { await client.db(name).dropDatabase(); }
    finally { await client.close(); }
  }
});
