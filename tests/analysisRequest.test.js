const { parseRawAnalysis, parseStoredAnalysis } = require('../src/utils/analysisRequest');
const { inputLogs } = require('./helpers/analysisEngineFixtures');

test('raw batches accept the first and last allowed counts without changing inputs', () => {
  const logs = inputLogs();
  expect(parseRawAnalysis({ logs })).toBe(logs);
  expect(parseRawAnalysis({ logs: Array.from({ length: 500 }, () => logs[0]) })).toHaveLength(500);
});
test.each([null, [], {}, { logs: [] }, { logs: 'bad' }, { logs: inputLogs(), extra: true }, { logs: Array(501).fill({}) }, { logs: [null] }, { logs: [{ ...inputLogs()[0], _id: 'a'.repeat(24) }] }])('rejects invalid raw envelope %#', (body) => {
  expect(() => parseRawAnalysis(body)).toThrow();
});
test('stored IDs normalize case and allow count boundaries', () => {
  expect(parseStoredAnalysis({ ids: ['ABCDEF123456ABCDEF123456'] })).toEqual(['abcdef123456abcdef123456']);
  expect(parseStoredAnalysis({ ids: Array.from({ length: 500 }, (_, i) => i.toString(16).padStart(24, '0')) })).toHaveLength(500);
});
test.each([{}, { ids: [] }, { ids: [null] }, { ids: [4] }, { ids: ['bad'] }, { ids: ['g'.repeat(24)] }, { ids: ['a'.repeat(24), 'A'.repeat(24)] }, { ids: ['a'.repeat(24)], logs: [] }, { ids: Array(501).fill('a'.repeat(24)) }])('rejects malformed/duplicate stored IDs %#', (body) => {
  expect(() => parseStoredAnalysis(body)).toThrow();
});
