jest.mock('../src/services/logService', () => ({ listLogs: jest.fn() }));
const request = require('supertest');
const { listLogs } = require('../src/services/logService');
const app = require('../src/app');

beforeEach(() => jest.clearAllMocks());

test('returns service data', async () => {
  const result = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  listLogs.mockResolvedValue(result);
  const response = await request(app).get('/api/logs');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(result);
});

test('rejects invalid parameters before accessing the database', async () => {
  const response = await request(app).get('/api/logs?limit=101');
  expect(response.status).toBe(400);
  expect(response.body.error).toEqual(expect.any(String));
  expect(listLogs).not.toHaveBeenCalled();
});

test('database failures use the centralized error response', async () => {
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    listLogs.mockRejectedValue(new Error('private database details'));
    const response = await request(app).get('/api/logs');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  } finally { consoleSpy.mockRestore(); }
});
