const { parseLogQuery } = require('../src/utils/logQuery');

test('defaults to the first page of twenty logs', () => {
  expect(parseLogQuery({})).toEqual({ filter: {}, page: 1, limit: 20 });
});

test('combines exact filters, a UTC day, and escaped literal message matching', () => {
  const result = parseLogQuery({ date: '2026-11-04', level: 'error', microservice: 'inventory-service', message: '[A].*', page: '2', limit: '100' });
  expect(result.page).toBe(2);
  expect(result.limit).toBe(100);
  expect(result.filter).toEqual({
    microservice: 'inventory-service', level: 'error',
    date: { $gte: new Date('2026-11-04T00:00:00Z'), $lt: new Date('2026-11-05T00:00:00Z') },
    message: { $regex: '\\[A\\]\\.\\*', $options: 'i' },
  });
});

test.each([
  { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: '1e2' },
  { limit: '101' }, { limit: '0' }, { page: '9007199254740992' },
  { page: '9007199254740991', limit: '100' }, { date: '2026-02-30' },
  { date: '2026-13-01' }, { date: '2026-1-1' }, { level: 'debug' },
  { microservice: '' }, { message: ['a', 'b'] }, { level: { $ne: 'info' } },
  { unknown: 'x' }, { message: 'x'.repeat(501) },
])('rejects invalid input %j with status 400', (query) => {
  expect(() => parseLogQuery(query)).toThrow();
  try { parseLogQuery(query); } catch (error) { expect(error.status).toBe(400); }
});
