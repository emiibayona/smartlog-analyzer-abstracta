const { createGeminiAnalysisAdapter } = require('../src/services/geminiAnalysisAdapter');
const { config, report } = require('./helpers/analysisEngineFixtures');

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
