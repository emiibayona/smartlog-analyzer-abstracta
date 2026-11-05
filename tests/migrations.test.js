const { runMigrations } = require('../db/migrate');
const initial = require('../db/migrations/001-initial-collections');

function database() {
  const history = { findOne: jest.fn().mockResolvedValue(null), updateOne: jest.fn().mockResolvedValue({ acknowledged: true }) };
  const db = { createCollection: jest.fn().mockResolvedValue(), collection: jest.fn(() => history) };
  return { db, history };
}

test('applies pending versions in order and records only confirmed completion', async () => {
  const { db, history } = database();
  const first = { id: '001-first', up: jest.fn() };
  const second = { id: '002-second', up: jest.fn() };
  const result = await runMigrations(db, [second, first], { timeoutMS: 1234 });
  expect(result).toEqual({ applied: ['001-first', '002-second'], skipped: [] });
  expect(first.up).toHaveBeenCalledWith(db, { timeoutMS: 1234 });
  expect(history.updateOne.mock.calls[0]).toEqual([{ _id: '001-first' }, { $setOnInsert: { appliedAt: expect.any(Date) } }, { upsert: true, timeoutMS: 1234, writeConcern: { w: 1 } }]);
});
test('already applied versions are skipped without modifying history', async () => {
  const { db, history } = database(); history.findOne.mockResolvedValue({ _id: '001-first' });
  const migration = { id: '001-first', up: jest.fn() };
  expect(await runMigrations(db, [migration])).toEqual({ applied: [], skipped: ['001-first'] });
  expect(migration.up).not.toHaveBeenCalled(); expect(history.updateOne).not.toHaveBeenCalled();
});
test('failures stop later versions and do not mark a failed version complete', async () => {
  const { db, history } = database();
  const next = { id: '002-next', up: jest.fn() };
  await expect(runMigrations(db, [{ id: '001-failed', up: async () => { throw new Error('index conflict'); } }, next])).rejects.toThrow('index conflict');
  expect(history.updateOne).not.toHaveBeenCalled(); expect(next.up).not.toHaveBeenCalled();
});
test('unacknowledged migration history fails the run', async () => {
  const { db, history } = database(); history.updateOne.mockResolvedValue({ acknowledged: false });
  await expect(runMigrations(db, [{ id: '001-first', up: async () => {} }])).rejects.toThrow('not acknowledged');
});
test.each([
  null,
  [null],
  [{ id: 'invalid', up: async () => {} }],
  [{ id: '001-first', up: null }],
  [{ id: '001-first', up: async () => {} }, { id: '001-first', up: async () => {} }],
].map((versions) => [versions]))('invalid migration registries fail before database access', async (versions) => {
  const { db } = database();
  await expect(runMigrations(db, versions)).rejects.toThrow('Invalid migration registry');
  expect(db.createCollection).not.toHaveBeenCalled();
});
test('initial migration tolerates existing collections but propagates other DDL failures', async () => {
  const indexes = jest.fn().mockResolvedValue();
  const db = { createCollection: jest.fn().mockRejectedValue({ code: 48 }), collection: jest.fn(() => ({ createIndexes: indexes })) };
  await initial.up(db, { timeoutMS: 1000 });
  expect(db.collection.mock.calls.map(([name]) => name)).toEqual(['logs', 'analyses', 'rejected_logs']);
  expect(indexes.mock.calls.map(([specs]) => specs.length)).toEqual([4, 4, 2]);
  db.createCollection.mockRejectedValue(new Error('database unavailable'));
  await expect(initial.up(db, { timeoutMS: 1000 })).rejects.toThrow('database unavailable');
});
