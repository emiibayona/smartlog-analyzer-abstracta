const request = require('supertest');
const app = require('../src/app');

test('GET /api returns plain text OK', async () => {
  const response = await request(app).get('/api');
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toMatch(/text\/plain/);
  expect(response.text).toBe('OK');
});

test('unknown routes return a JSON 404', async () => {
  const response = await request(app).get('/api/missing');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: 'Not found' });
});
