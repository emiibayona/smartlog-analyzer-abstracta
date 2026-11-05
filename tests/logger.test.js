const request = require('supertest');
const { errorDetails } = require('../src/utils/logger');
const app = require('../src/app');

test('error diagnostics exclude secret-bearing messages and stacks', () => {
  const error = Object.assign(new Error('password=secret'), { code: 'ECONNREFUSED', cause: Object.assign(new Error('token=secret'), { code: 'ETIMEDOUT' }) });
  const details = errorDetails(error);
  expect(details.code).toBe('ECONNREFUSED');
  expect(details.causeCode).toBe('ETIMEDOUT');
  expect(JSON.stringify(details)).not.toMatch(/secret|password|token|stack/);
});
test('request logs have generated IDs and omit queries and credentials', async () => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    const response = await request(app).get('/api?token=secret').set('Authorization', 'Bearer secret').set('X-Request-Id', 'untrusted');
    const entry = JSON.parse(spy.mock.calls[0][0]);
    expect(entry.requestId).toBe(response.headers['x-request-id']);
    expect(entry.requestId).not.toBe('untrusted');
    expect(entry.status).toBe(200);
    expect(JSON.stringify(entry)).not.toMatch(/secret|token|Bearer/);
  } finally { spy.mockRestore(); }
});
