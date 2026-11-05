const { analyzeLogs } = require('../src/services/analysisEngine');
const { prepareAnalysisInput } = require('../src/utils/analysisInput');
const { validateReport, redactSecrets } = require('../src/utils/analysisReport');
const { loadAnalysisEnvironment } = require('../src/config/analysisEnvironment');
const { AnalysisError } = require('../src/utils/analysisErrors');
const { config, inputLogs, report } = require('./helpers/analysisEngineFixtures');

let repository;
beforeEach(() => {
  repository = { create: jest.fn().mockResolvedValue('synthetic-analysis'), update: jest.fn().mockResolvedValue() };
});
test('valid analysis is persisted only after schema/evidence validation', async () => {
  const provider = { analyze: jest.fn().mockResolvedValue(report()) };
  const result = await analyzeLogs(inputLogs(), { config, provider, repository });
  expect(result.status).toBe('Completed');
  expect(repository.create.mock.calls[0][0]).toMatchObject({ status: 'Pending', logCount: 2, microservice: 'multiple', model: 'test-model' });
  expect(repository.update.mock.calls[0][1].status).toBe('In progress');
  expect(repository.update.mock.calls[1][1]).toMatchObject({ status: 'Completed', message: report().summary, levelCounts: { info: 0, warn: 0, error: 2 } });
  expect(JSON.stringify(provider.analyze.mock.calls)).not.toContain('synthetic-secret');
  expect(repository.create.mock.calls[0][0]).not.toHaveProperty('logs');
});
test('multiple chunks receive a final synthesis pass with all evidence IDs', async () => {
  const provider = { analyze: jest.fn(async (input, ids) => report(ids)) };
  const smallConfig = { ...config, chunkBytes: 240 };
  const result = await analyzeLogs(inputLogs(), { config: smallConfig, provider, repository });
  expect(result.status).toBe('Completed');
  expect(provider.analyze).toHaveBeenCalledTimes(3);
  expect(provider.analyze.mock.calls[2][0].mode).toBe('synthesis');
  expect(provider.analyze.mock.calls[0][0]).toMatchObject({ mode: 'synthesis', phase: 'chunk' });
  expect(provider.analyze.mock.calls[2][0].phase).toBe('synthesis');
  expect(provider.analyze.mock.calls[2][1]).toEqual(['input-1', 'input-2']);
});
test('configured mode is sent to every phase and persisted independently of orchestration', async () => {
  const provider = { analyze: jest.fn(async (input, ids) => report(ids)) };
  await analyzeLogs(inputLogs(), { config: { ...config, mode: 'patterns', chunkBytes: 240 }, provider, repository });
  expect(provider.analyze).toHaveBeenCalledTimes(3);
  expect(provider.analyze.mock.calls.every(([input]) => input.mode === 'patterns')).toBe(true);
  expect(repository.create.mock.calls[0][0].mode).toBe('patterns');
});
test.each(['PROVIDER_TIMEOUT', 'PROVIDER_REFUSAL', 'INVALID_RESPONSE', 'PROVIDER_ERROR'])('provider failure %s persists Failed without a result', async (code) => {
  const provider = { analyze: jest.fn().mockRejectedValue(new AnalysisError(code)) };
  await expect(analyzeLogs(inputLogs(), { config, provider, repository })).rejects.toMatchObject({ code, analysisId: 'synthetic-analysis' });
  expect(repository.update.mock.calls.at(-1)).toEqual(['synthetic-analysis', expect.objectContaining({ status: 'Failed', errorCode: code }), true]);
});
test('a malformed report cannot become completed', async () => {
  const provider = { analyze: jest.fn().mockResolvedValue({ summary: 'bad' }) };
  await expect(analyzeLogs(inputLogs(), { config, provider, repository })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(repository.update.mock.calls.some((call) => call[1].status === 'Completed')).toBe(false);
});
test('a later chunk failure never persists partial success', async () => {
  const provider = { analyze: jest.fn().mockResolvedValueOnce(report(['input-1'])).mockRejectedValueOnce(new AnalysisError('PROVIDER_TIMEOUT')) };
  await expect(analyzeLogs(inputLogs(), { config: { ...config, chunkBytes: 240 }, provider, repository })).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  expect(repository.update.mock.calls.at(-1)[1].status).toBe('Failed');
});
test('completion persistence failure is marked Failed and never returned as success', async () => {
  repository.update.mockResolvedValueOnce().mockRejectedValueOnce(new AnalysisError('PERSISTENCE_FAILED')).mockResolvedValueOnce();
  await expect(analyzeLogs(inputLogs(), { config, provider: { analyze: async () => report() }, repository })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
  expect(repository.update.mock.calls.at(-1)[1].status).toBe('Failed');
});
test('failed-state persistence failure surfaces as persistence error', async () => {
  repository.update.mockResolvedValueOnce().mockRejectedValueOnce(new Error('db offline'));
  await expect(analyzeLogs(inputLogs(), { config, provider: { analyze: async () => { throw new AnalysisError('PROVIDER_TIMEOUT'); } }, repository })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
});
test('initial persistence failure prevents provider calls', async () => {
  const provider = { analyze: jest.fn() };
  repository.create.mockRejectedValue(new AnalysisError('PERSISTENCE_FAILED'));
  await expect(analyzeLogs(inputLogs(), { config, provider, repository })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
  expect(provider.analyze).not.toHaveBeenCalled();
});
test('total deadline prevents starting another provider request', async () => {
  const spy = jest.spyOn(Date, 'now');
  spy.mockReturnValueOnce(0).mockReturnValueOnce(101);
  const provider = { analyze: jest.fn() };
  try {
    await expect(analyzeLogs(inputLogs(), { config: { ...config, totalTimeoutMs: 100 }, provider, repository })).rejects.toMatchObject({ code: 'ANALYSIS_TIMEOUT' });
    expect(provider.analyze).not.toHaveBeenCalled();
  } finally { spy.mockRestore(); }
});
test.each([[], null, [{}], [{ ...inputLogs()[0], date: 'invalid' }]])('invalid batches are rejected before persistence: %#', async (logs) => {
  await expect(analyzeLogs(logs, { config, repository })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  expect(repository.create).not.toHaveBeenCalled();
});
test('batch, chunk, log-count and duplicate-ID bounds are enforced', () => {
  const logs = inputLogs();
  expect(() => prepareAnalysisInput(logs, { ...config, maxLogs: 1 })).toThrow();
  expect(() => prepareAnalysisInput(logs, { ...config, maxBatchBytes: 1 })).toThrow();
  expect(() => prepareAnalysisInput(logs, { ...config, chunkBytes: 1 })).toThrow();
  expect(() => prepareAnalysisInput(logs, { ...config, chunkBytes: 240, maxChunks: 1 })).toThrow();
  expect(() => prepareAnalysisInput(logs.map((entry) => ({ ...entry, id: 'a'.repeat(24) })), config)).toThrow();
});
test('stored IDs and Date values are retained as references without sending payload paths', () => {
  const result = prepareAnalysisInput([{ ...inputLogs()[0], id: 'A'.repeat(24), date: new Date('2026-11-05T12:00:00Z'), payload: 'private/file.log' }], config);
  expect(result.logIds).toEqual(['a'.repeat(24)]);
  expect(result.input[0].id).toBe(`log-${'a'.repeat(24)}`);
  expect(JSON.stringify(result.input)).not.toContain('private/file.log');
});
test.each([
  { ...report(), extra: 'invalid' },
  { ...report(), patterns: [{ ...report().patterns[0], evidenceLogIds: ['invented'] }] },
  { ...report(), patterns: [{ ...report().patterns[0], evidenceLogIds: ['input-1', 'input-1'] }] },
  { ...report(), summary: '' },
])('invalid output shape/evidence is rejected: %#', (value) => {
  expect(() => validateReport(value, ['input-1', 'input-2'])).toThrow();
});
test('secret redaction covers common tokens, credentials, and API keys', () => {
  const value = redactSecrets('Authorization: Bearer demo-token password="demo-password with spaces" token=demo-token mongodb://demo-user:demo-pass@host/db sk-abcdefghijk');
  expect(value).not.toMatch(/demo-token|demo-password|demo-user|demo-pass|sk-abcdefghijk/);
  expect(value).not.toContain('with spaces');
});
test('engine configuration is optional until invocation and validates required values', () => {
  expect(() => loadAnalysisEnvironment({})).toThrow('OPENAI_API_KEY');
  expect(() => loadAnalysisEnvironment({ OPENAI_API_KEY: 'synthetic' })).toThrow('OPENAI_MODEL');
  const env = { OPENAI_API_KEY: 'synthetic', OPENAI_MODEL: 'test-model' };
  expect(loadAnalysisEnvironment(env).requestTimeoutMs).toBe(30000);
  expect(loadAnalysisEnvironment(env).mode).toBe('synthesis');
  expect(loadAnalysisEnvironment({ ...env, ANALYSIS_MODE: 'patterns' }).mode).toBe('patterns');
  for (const mode of ['', ' ', 'Synthesis', 'a'.repeat(65), 'ignore instructions']) {
    expect(() => loadAnalysisEnvironment({ ...env, ANALYSIS_MODE: mode })).toThrow('ANALYSIS_MODE');
  }
  expect(() => loadAnalysisEnvironment({ ...env, ANALYSIS_CHUNK_BYTES: '0' })).toThrow();
});
