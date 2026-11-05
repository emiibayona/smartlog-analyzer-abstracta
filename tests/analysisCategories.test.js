const { findingCategories, reportSchema, validateReport } = require('../src/utils/analysisReport');
const { analyzeLogs } = require('../src/services/analysisEngine');
const { config, report, inputLogs } = require('./helpers/analysisEngineFixtures');

const evidence = ['input-1', 'input-2'];
for (const section of ['patterns', 'commonIssues', 'insights']) {
  test.each(findingCategories)(`${section} accepts explicit category %s`, (category) => {
    const value = { summary: 'Synthetic report', patterns: [], commonIssues: [], insights: [] };
    value[section] = [{ ...report().patterns[0], category }];
    expect(validateReport(value, evidence)[section][0].category).toBe(category);
  });
  test.each([undefined, null, '', 'Latency', 'unsupported', 'latency ', 1, ['latency']])(`${section} rejects missing/invalid category %j`, (category) => {
    const value = { summary: 'Synthetic report', patterns: [], commonIssues: [], insights: [] };
    const finding = { ...report().patterns[0] };
    if (category === undefined) delete finding.category; else finding.category = category;
    value[section] = [finding];
    expect(() => validateReport(value, evidence)).toThrow();
  });
}
test('provider JSON Schema requires the same explicit taxonomy in every section', () => {
  for (const section of ['patterns', 'commonIssues', 'insights']) {
    expect(reportSchema.properties[section].items.required).toContain('category');
    expect(reportSchema.properties[section].items.properties.category.enum).toEqual(findingCategories);
  }
});
test('empty finding arrays remain valid without fabricated categories', () => {
  const value = { summary: 'No patterns supported by these logs.', patterns: [], commonIssues: [], insights: [] };
  expect(validateReport(value, evidence)).toEqual(value);
});
test('missing categories in final synthesis cannot overwrite valid chunk reports with success', async () => {
  const malformed = report(); delete malformed.patterns[0].category;
  const provider = { analyze: jest.fn().mockResolvedValueOnce(report(['input-1'])).mockResolvedValueOnce(report(['input-2'])).mockResolvedValueOnce(malformed) };
  const repository = { create: jest.fn().mockResolvedValue('test-analysis'), update: jest.fn().mockResolvedValue() };
  await expect(analyzeLogs(inputLogs(), { config: { ...config, chunkBytes: 240 }, provider, repository })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  expect(repository.update.mock.calls.some((call) => call[1].status === 'Completed')).toBe(false);
  expect(repository.update.mock.calls.at(-1)[1].status).toBe('Failed');
});
