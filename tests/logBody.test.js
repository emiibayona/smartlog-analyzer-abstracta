const { validateLogBody, microservices } = require('../src/utils/logBody');
const valid = { microservice: 'inventory-service', date: '2026-11-05T12:34:56.123Z', level: 'info', message: 'Stock updated' };

test.each(microservices)('accepts %s and normalizes text and timestamps', (microservice) => {
  const result = validateLogBody({ ...valid, microservice, date: '2026-11-05T09:34:56.123-03:00', message: ' hello ', payload: ' files/demo.log ' });
  expect(result.issues).toEqual([]);
  expect(result.value.date.toISOString()).toBe(valid.date);
  expect(result.value.message).toBe('hello');
  expect(result.value.payload).toBe('files/demo.log');
});
test.each([null, [], 'text', 3, true, {}, { ...valid, microservice: 'unknown' }, { ...valid, microservice: {} }, { ...valid, level: 'DEBUG' }, { ...valid, message: '' }, { ...valid, message: ' ' }, { ...valid, message: 1 }, { ...valid, message: 'x'.repeat(16385) }, { ...valid, payload: null }, { ...valid, payload: {} }, { ...valid, payload: ' ' }, { ...valid, payload: 'x'.repeat(4097) }, { ...valid, _id: 'user-id' }, { ...valid, date: '2026-02-30T12:00:00Z' }, { ...valid, date: '2026-11-05' }, { ...valid, date: 0 }, { ...valid, date: '2026-11-05T24:00:00Z' }, { ...valid, date: '2026-11-05T12:00:00' }])('rejects invalid body %#', (body) => {
  expect(validateLogBody(body).issues.length).toBeGreaterThan(0);
});
test('accepts size boundaries and leap days', () => {
  expect(validateLogBody({ ...valid, date: '2028-02-29T00:00:00Z', message: 'x'.repeat(16384), payload: 'x'.repeat(4096) }).issues).toEqual([]);
});
test('reports all validation issues together', () => expect(validateLogBody({}).issues.length).toBe(4));
