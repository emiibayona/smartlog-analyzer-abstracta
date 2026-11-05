jest.mock('../db/models/log', () => ({ find: jest.fn() }));
jest.mock('../src/services/analysisEngine', () => ({ analyzeLogs: jest.fn() }));
const Log = require('../db/models/log');
const { analyzeLogs } = require('../src/services/analysisEngine');
const { submitStoredAnalysis } = require('../src/services/analysisSubmissionService');

beforeEach(() => jest.resetAllMocks());
function query(documents) {
  const result = { maxTimeMS: jest.fn(), setOptions: jest.fn(), lean: jest.fn().mockResolvedValue(documents) };
  result.maxTimeMS.mockReturnValue(result); result.setOptions.mockReturnValue(result);
  Log.find.mockReturnValue(result);
  return result;
}
test('stored lookup has deadlines and maintains caller ordering', async () => {
  const first = { _id: 'a'.repeat(24) }; const second = { _id: 'b'.repeat(24) };
  const chain = query([second, first]);
  analyzeLogs.mockResolvedValue({ id: 'done' });
  const options = { queryTimeoutMs: 1234 };
  expect(await submitStoredAnalysis([first._id, second._id], options)).toEqual({ id: 'done' });
  expect(chain.maxTimeMS).toHaveBeenCalledWith(1234);
  expect(chain.setOptions).toHaveBeenCalledWith({ timeoutMS: 1234 });
  expect(analyzeLogs).toHaveBeenCalledWith([first, second], options);
});
test('any missing ID rejects the entire batch before provider work', async () => {
  query([]);
  await expect(submitStoredAnalysis(['a'.repeat(24)])).rejects.toMatchObject({ status: 404 });
  expect(analyzeLogs).not.toHaveBeenCalled();
});
test('database query failures propagate', async () => {
  query([]).lean.mockRejectedValue(new Error('database offline'));
  await expect(submitStoredAnalysis(['a'.repeat(24)])).rejects.toThrow('database offline');
});
test('aborted work does not start a query or the engine', async () => {
  const abort = new AbortController(); abort.abort(new Error('cancelled'));
  await expect(submitStoredAnalysis([], { signal: abort.signal })).rejects.toThrow('cancelled');
  expect(Log.find).not.toHaveBeenCalled();
});
test('cancellation during lookup prevents engine execution', async () => {
  const abort = new AbortController();
  const chain = query([]);
  chain.lean.mockImplementation(async () => { abort.abort(new Error('cancelled')); return []; });
  await expect(submitStoredAnalysis([], { signal: abort.signal })).rejects.toThrow('cancelled');
  expect(analyzeLogs).not.toHaveBeenCalled();
});
