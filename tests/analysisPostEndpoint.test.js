jest.mock('../src/services/analysisEngine', () => ({ analyzeLogs: jest.fn() }));
jest.mock('../src/services/analysisSubmissionService', () => ({ submitStoredAnalysis: jest.fn() }));
const request = require('supertest');
const { analyzeLogs } = require('../src/services/analysisEngine');
const { submitStoredAnalysis } = require('../src/services/analysisSubmissionService');
const { AnalysisError } = require('../src/utils/analysisErrors');
const app = require('../src/app');
const { inputLogs } = require('./helpers/analysisEngineFixtures');
const endpoints = [['/api/logs/analyze', { logs: inputLogs() }, analyzeLogs], ['/api/logs/stored/analyze', { ids: ['a'.repeat(24)] }, submitStoredAnalysis]];

beforeEach(() => { jest.resetAllMocks(); delete app.locals.analysisHttpTimeoutMs; });
afterEach(() => { delete app.locals.analysisHttpTimeoutMs; });
test.each(endpoints)('%s returns 201 only on completed engine results', async (url, body, service) => {
  service.mockImplementation(async (logs, options) => { options.onCreated('analysis-id'); return { id: 'analysis-id', status: 'Completed', report: {} }; });
  const response = await request(app).post(url).send(body);
  expect(response.status).toBe(201);
  expect(response.body.status).toBe('Completed');
  expect(service.mock.calls[0][1].requestId).toBe(response.headers['x-request-id']);
});
test.each(endpoints)('%s rejects malformed envelopes and transport', async (url, body, service) => {
  for (const invalid of [null, [], {}, { extra: true }]) expect((await request(app).post(url).set('Content-Type', 'application/json').send(JSON.stringify(invalid))).status).toBe(400);
  expect((await request(app).post(url).set('Content-Type', 'application/json').send('{bad')).status).toBe(400);
  expect((await request(app).post(url).set('Content-Type', 'application/json').send('')).status).toBe(400);
  expect((await request(app).post(url).set('Content-Type', 'text/plain').send('data')).status).toBe(415);
  expect((await request(app).post(`${url}?extra=1`).send(body)).status).toBe(400);
  const large = await request(app).post(url).send({ extra: 'x'.repeat(1024 * 1024) });
  expect(large.status).toBe(413);
  expect(large.body.error).toContain('1 MiB');
  expect(service).not.toHaveBeenCalled();
});
test.each([
  ['INVALID_CONFIGURATION', 503], ['INVALID_INPUT', 400], ['INPUT_TOO_LARGE', 413],
  ['PROVIDER_TIMEOUT', 504], ['ANALYSIS_TIMEOUT', 504], ['REQUEST_TIMEOUT', 504], ['REQUEST_ABORTED', 408],
  ['PROVIDER_ERROR', 502], ['INVALID_RESPONSE', 502], ['PROVIDER_REFUSAL', 502],
  ['PROVIDER_AUTH', 503], ['PROVIDER_RATE_LIMIT', 503], ['PERSISTENCE_FAILED', 503], ['ANALYSIS_FAILED', 500],
])('analysis failure %s maps to %i without leaking details', async (code, status) => {
  analyzeLogs.mockRejectedValue(Object.assign(new AnalysisError(code), { analysisId: 'saved-id' }));
  const response = await request(app).post('/api/logs/analyze').send({ logs: inputLogs() });
  expect(response.status).toBe(status);
  expect(response.body).toMatchObject({ code, analysisId: 'saved-id' });
});
test('HTTP deadline aborts provider work and returns the known analysis ID', async () => {
  app.locals.analysisHttpTimeoutMs = 20;
  analyzeLogs.mockImplementation((logs, options) => {
    options.onCreated('saved-id');
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }));
  });
  const response = await request(app).post('/api/logs/analyze').send({ logs: inputLogs() });
  expect(response.status).toBe(504);
  expect(response.body).toMatchObject({ code: 'REQUEST_TIMEOUT', analysisId: 'saved-id' });
});
test('deadline before an ID exists still returns controlled 504', async () => {
  app.locals.analysisHttpTimeoutMs = 20;
  analyzeLogs.mockImplementation((logs, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })));
  const response = await request(app).post('/api/logs/analyze').send({ logs: inputLogs() });
  expect(response.status).toBe(504);
  expect(response.body.analysisId).toBeUndefined();
});
test.each(endpoints)('%s late resolution cannot send another response after timeout', async (url, body, service) => {
  app.locals.analysisHttpTimeoutMs = 10;
  let finish;
  service.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const response = await request(app).post(url).send(body);
  expect(response.status).toBe(504);
  finish({ id: 'late', status: 'Completed' });
  await new Promise((resolve) => setImmediate(resolve));
});
