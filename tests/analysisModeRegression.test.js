const { analyzeLogs } = require('../src/services/analysisEngine');
const { loadAnalysisEnvironment } = require('../src/config/analysisEnvironment');
const { inputLogs } = require('./helpers/analysisEngineFixtures');

const original = { ...process.env };
afterEach(() => {
  for (const key of ['GEMINI_API_KEY', 'GEMINI_MODEL', 'ANALYSIS_MODE']) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test.each(['', ' ', 'Synthesis', 'invalid mode', '*', 'x'.repeat(65)])(
  'invalid ANALYSIS_MODE %j rejects analysis before any storage or provider work', async (mode) => {
    process.env.GEMINI_API_KEY = 'synthetic-key';
    process.env.GEMINI_MODEL = 'test-model';
    process.env.ANALYSIS_MODE = mode;
    const repository = { create: jest.fn(), update: jest.fn() };
    const provider = { analyze: jest.fn() };
    await expect(analyzeLogs(inputLogs(), { repository, provider })).rejects.toMatchObject({ code: 'INVALID_CONFIGURATION' });
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
    expect(provider.analyze).not.toHaveBeenCalled();
  },
);

test('an absent mode uses synthesis rather than crashing', () => {
  expect(loadAnalysisEnvironment({ GEMINI_API_KEY: 'synthetic', GEMINI_MODEL: 'test-model' }).mode).toBe('synthesis');
});
