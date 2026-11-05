const { parseAnalysisQuery, parseAnalysisId } = require('../src/utils/analysisQuery');
const { Analysis } = require('../db/models/analysis');

test('uses log pagination defaults and supports all analysis filters', () => {
  expect(parseAnalysisQuery({})).toEqual({ filter: {}, page: 1, limit: 20 });
  const result = parseAnalysisQuery({ status: 'In progress', microservice: 'inventory-service', date: '2026-11-04', message: '[a].*', page: '2', limit: '100' });
  expect(result.filter.status).toBe('In progress');
  expect(result.filter.message.$regex).toBe('\\[a\\]\\.\\*');
  expect(result.page).toBe(2);
});
test.each([{ status: '' }, { status: 'completed' }, { status: ['Pending', 'Completed'] }, { level: 'error' }, { date: '2026-02-30' }, { page: '0' }, { limit: '101' }, { unknown: 'x' }, { message: ' ' }])('rejects invalid analysis query %j', (query) => {
  expect(() => parseAnalysisQuery(query)).toThrow();
});
test.each(['abc', 'a'.repeat(23), 'g'.repeat(24), '1'.repeat(25)])('rejects invalid ID %s', (id) => {
  expect(() => parseAnalysisId(id)).toThrow();
});
test('accepts hexadecimal IDs in either case', () => expect(parseAnalysisId('ABCDEF123456ABCDEF123456')).toBe('ABCDEF123456ABCDEF123456'));
test('pending analyses can exist without a result; invalid statuses are rejected', async () => {
  await expect(new Analysis({ microservice: 'inventory-service', date: new Date(), status: 'Pending' }).validate()).resolves.toBeUndefined();
  await expect(new Analysis({ microservice: 'inventory-service', date: new Date(), status: 'invalid' }).validate()).rejects.toThrow();
});
