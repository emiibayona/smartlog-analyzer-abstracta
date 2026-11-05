const { createGeminiAnalysisAdapter } = require('../src/services/geminiAnalysisAdapter');
const { config, report } = require('./helpers/analysisEngineFixtures');
const { AnalysisError } = require('../src/utils/analysisErrors');

afterEach(() => jest.restoreAllMocks());
function envelope(parts = [{ text: JSON.stringify(report()) }]) {
  return { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts } }] };
}
test('uses Gemini model URL, key header and JSON Schema without tools', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(envelope())));
  const result = await createGeminiAnalysisAdapter(config).analyze({ mode: 'synthesis', phase: 'chunk', logs: [] }, ['input-1', 'input-2']);
  expect(result.summary).toBe(report().summary);
  const [url, options] = fetchSpy.mock.calls[0];
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent');
  expect(options.headers['x-goog-api-key']).toBe('synthetic-test-key');
  expect(url).not.toContain('synthetic-test-key');
  const body = JSON.parse(options.body);
  expect(body.generationConfig.responseMimeType).toBe('application/json');
  expect(body.generationConfig.responseJsonSchema.required).toContain('summary');
  expect(body).not.toHaveProperty('tools');
  expect(body).not.toHaveProperty('store');
});
test.each([
  [{ promptFeedback: { blockReason: 'SAFETY' } }, 'PROVIDER_REFUSAL'],
  [{ candidates: [{ finishReason: 'RECITATION' }] }, 'PROVIDER_REFUSAL'],
  [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }, 'INVALID_RESPONSE'],
  [{ candidates: [] }, 'INVALID_RESPONSE'],
  [{ unexpected: true }, 'INVALID_RESPONSE'],
  [envelope([{ functionCall: { name: 'unexpected' } }]), 'INVALID_RESPONSE'],
  [envelope([{ text: '{invalid' }]), 'INVALID_RESPONSE'],
])('rejects blocked or invalid Gemini response %#', async (body, code) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(body)));
  await expect(createGeminiAnalysisAdapter(config).analyze({}, ['input-1', 'input-2'])).rejects.toMatchObject({ code });
});
test('joins text fragments and ignores thought parts', async () => {
  const text = JSON.stringify(report());
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(envelope([{ thought: true, text: 'not part of the output' }, { text: text.slice(0, 20) }, { text: text.slice(20) }]))));
  expect(await createGeminiAnalysisAdapter(config).analyze({}, ['input-1', 'input-2'])).toEqual(report());
});
test('network failures never expose the API key', async () => {
  jest.spyOn(global, 'fetch').mockRejectedValue(new Error('synthetic-test-key private connection details'));
  const promise = createGeminiAnalysisAdapter(config).analyze({}, []);
  await expect(promise).rejects.toMatchObject({ code: 'PROVIDER_ERROR', message: 'Log analysis could not be completed' });
});
test('unsupported endpoints and oversize requests are rejected before fetch', async () => {
  expect(() => createGeminiAnalysisAdapter(config, { endpoint: 'http://external.example/api' })).toThrow();
  const spy = jest.spyOn(global, 'fetch');
  await expect(createGeminiAnalysisAdapter(config).analyze({ text: 'x'.repeat(1000000) }, [])).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
  expect(spy).not.toHaveBeenCalled();
});
test.each([401, 403, 429, 500])('HTTP %i errors are safely classified', async (status) => {
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response('private', { status }));
  const code = status === 429 ? 'PROVIDER_RATE_LIMIT' : status === 500 ? 'PROVIDER_ERROR' : 'PROVIDER_AUTH';
  await expect(createGeminiAnalysisAdapter(config).analyze({}, [])).rejects.toMatchObject({ code });
});
test('oversized or malformed response envelopes are rejected', async () => {
  const spy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('x'.repeat(256001))).mockResolvedValueOnce(new Response('{bad'));
  for (let index = 0; index < 2; index++) await expect(createGeminiAnalysisAdapter(config).analyze({}, [])).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(spy).toHaveBeenCalledTimes(2);
});
test('request and provider deadlines cancel in-flight transport', async () => {
  jest.spyOn(global, 'fetch').mockImplementation((url, options) => new Promise((resolve, reject) => {
    if (options.signal.aborted) reject(new Error('aborted'));
    else options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }));
  const external = new AbortController();
  const operation = createGeminiAnalysisAdapter(config).analyze({}, [], 2000, external.signal);
  external.abort(new AnalysisError('REQUEST_TIMEOUT'));
  await expect(operation).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  await expect(createGeminiAnalysisAdapter(config).analyze({}, [], 5)).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT' });
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await expect(createGeminiAnalysisAdapter(config).analyze({}, [], 100, alreadyAborted.signal)).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
});
