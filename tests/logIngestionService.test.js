const Log = require('../db/models/log');
const RejectedLog = require('../db/models/rejectedLog');
const { ingestLog } = require('../src/services/logIngestionService');
const valid = { microservice: 'inventory-service', date: '2026-11-05T12:00:00Z', level: 'info', message: 'Synthetic stock update' };
let primary;
let fallback;
beforeEach(() => {
  primary = jest.spyOn(Log.collection, 'insertOne').mockResolvedValue({ acknowledged: true });
  fallback = jest.spyOn(RejectedLog.collection, 'insertOne').mockResolvedValue({ acknowledged: true });
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
const input = (body) => ({ body, submissionJson: JSON.stringify(body), requestId: 'test-request' });
test('valid logs use primary storage with a deadline', async () => {
  const result = await ingestLog(input(valid), 1234);
  expect(result.status).toBe(201);
  expect(result.body.id).toMatch(/^[a-f0-9]{24}$/);
  expect(primary.mock.calls[0][1]).toEqual({ timeoutMS: 1234, writeConcern: { w: 1 } });
  expect(fallback).not.toHaveBeenCalled();
});
test('invalid logs preserve the original submission and reasons in fallback only', async () => {
  const result = await ingestLog(input({ ...valid, level: 'bad', extra: { '$key': 'value' } }));
  expect(result.status).toBe(202);
  expect(result.body.reason).toBe('validation');
  expect(primary).not.toHaveBeenCalled();
  const document = fallback.mock.calls[0][0];
  expect(JSON.parse(document.submissionJson).extra).toEqual({ '$key': 'value' });
  expect(document.issues).toHaveLength(2);
});
test.each([new Error('private database secret'), Object.assign(new Error('timeout'), { code: 50 })])('primary failure is confirmed in fallback', async (error) => {
  primary.mockRejectedValue(error);
  const result = await ingestLog(input(valid));
  expect(result.status).toBe(202);
  expect(result.body.reason).toBe('primary_write');
  expect(fallback.mock.calls[0][0].primaryLogId).toBeDefined();
  expect(JSON.stringify(result)).not.toContain('private');
});
test('unacknowledged primary writes use fallback', async () => {
  primary.mockResolvedValue({ acknowledged: false });
  expect((await ingestLog(input(valid))).status).toBe(202);
});
test.each([valid, {}])('fallback failure never acknowledges storage', async (body) => {
  primary.mockRejectedValue(new Error('offline'));
  fallback.mockRejectedValue(new Error('offline'));
  await expect(ingestLog(input(body))).rejects.toMatchObject({ status: 503 });
});
test('unacknowledged fallback write returns 503', async () => {
  fallback.mockResolvedValue({ acknowledged: false });
  await expect(ingestLog(input({}))).rejects.toMatchObject({ status: 503 });
});
