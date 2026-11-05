jest.mock('../src/services/healthService', () => ({ checkHealth: jest.fn() }));
const request = require('supertest');
const { checkHealth } = require('../src/services/healthService');
const app = require('../src/app');

test('health returns success for a live database', async () => {
  checkHealth.mockResolvedValue();
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(response.headers['cache-control']).toBe('no-store');
});
test('health returns 503 without exposing connection details', async () => {
  checkHealth.mockRejectedValue(new Error('mongodb://private:secret@host/db'));
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ error: 'Database unavailable' });
});
