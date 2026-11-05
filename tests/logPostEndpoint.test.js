jest.mock('../src/services/logIngestionService', () => ({ ingestLog: jest.fn() }));
const request = require('supertest');
const { ingestLog } = require('../src/services/logIngestionService');
const app = require('../src/app');
beforeEach(() => jest.resetAllMocks());
test('201 and 202 responses forward the service result', async () => {
  for (const status of [201, 202]) {
    ingestLog.mockResolvedValue({ status, body: { id: 'synthetic' } });
    const response = await request(app).post('/api/logs').send({ message: 'synthetic' });
    expect(response.status).toBe(status);
    expect(ingestLog.mock.calls.at(-1)[0].requestId).toBe(response.headers['x-request-id']);
  }
});
test.each([
  ['application/json', '{bad', 400],
  ['text/plain', '{}', 415],
  ['application/json; charset=iso-8859-1', '{}', 415],
  ['application/json', JSON.stringify({ message: 'x'.repeat(65536) }), 413],
])('invalid transport %s returns %s without storage', async (type, body, status) => {
  const response = await request(app).post('/api/logs').set('Content-Type', type).send(body);
  expect(response.status).toBe(status);
  expect(typeof response.body.error).toBe('string');
  expect(ingestLog).not.toHaveBeenCalled();
});
test('empty JSON bodies and unsupported query parameters return 400', async () => {
  const empty = await request(app).post('/api/logs').set('Content-Type', 'application/json').send('');
  expect(empty.status).toBe(400);
  const query = await request(app).post('/api/logs?extra=true').send({});
  expect(query.status).toBe(400);
  expect(ingestLog).not.toHaveBeenCalled();
});
test('failed primary and fallback storage returns a retryable 503', async () => {
  ingestLog.mockRejectedValue(Object.assign(new Error('Log storage unavailable; retry the submission'), { status: 503 }));
  const response = await request(app).post('/api/logs').send({});
  expect(response.status).toBe(503);
  expect(response.body.error).toContain('retry');
});
