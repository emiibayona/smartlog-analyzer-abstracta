jest.mock('../src/services/analysisService', () => ({ listAnalyses: jest.fn(), findAnalysis: jest.fn() }));
const request = require('supertest');
const service = require('../src/services/analysisService');
const app = require('../src/app');
const id = 'abcdef123456abcdef123456';
beforeEach(() => jest.resetAllMocks());
test('list returns the service pagination envelope', async () => {
  const result = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  service.listAnalyses.mockResolvedValue(result);
  const response = await request(app).get('/api/analysis/');
  expect(response.status).toBe(200);
  expect(response.body).toEqual(result);
});
test('lookup returns a single analysis', async () => {
  service.findAnalysis.mockResolvedValue({ id, status: 'Pending' });
  const response = await request(app).get(`/api/analysis/${id}`);
  expect(response.status).toBe(200);
  expect(response.body.id).toBe(id);
});
test.each(['/api/analysis?status=invalid', '/api/analysis/not-an-id', `/api/analysis/${id}?page=1`])('rejects invalid input before DB access: %s', async (path) => {
  expect((await request(app).get(path)).status).toBe(400);
  expect(service.listAnalyses).not.toHaveBeenCalled();
  expect(service.findAnalysis).not.toHaveBeenCalled();
});
test('missing analysis uses JSON 404', async () => {
  service.findAnalysis.mockRejectedValue(Object.assign(new Error('Analysis not found'), { status: 404 }));
  const response = await request(app).get(`/api/analysis/${id}`);
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: 'Analysis not found' });
});
test.each(['listAnalyses', 'findAnalysis'])('%s handles database failures without leaking details', async (method) => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const path = method === 'listAnalyses' ? '/api/analysis' : `/api/analysis/${id}`;
    service[method].mockRejectedValue(new Error('private database URI'));
    expect((await request(app).get(path)).body).toEqual({ error: 'Internal server error' });
    service[method].mockRejectedValue(Object.assign(new Error('private'), { code: 50 }));
    const timeout = await request(app).get(path);
    expect(timeout.status).toBe(503);
    expect(timeout.body).toEqual({ error: 'Database temporarily unavailable' });
  } finally { spy.mockRestore(); }
});
