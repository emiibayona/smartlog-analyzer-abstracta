jest.mock('../db/models/log', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
const Log = require('../db/models/log');
const { listLogs } = require('../src/services/logService');

test('both page and count queries get server and client deadlines', async () => {
  const pageQuery = {};
  for (const key of ['sort', 'skip', 'limit', 'maxTimeMS', 'setOptions']) pageQuery[key] = jest.fn().mockReturnValue(pageQuery);
  pageQuery.lean = jest.fn().mockResolvedValue([{ _id: { toString: () => 'demo' }, message: 'test' }]);
  const countQuery = { maxTimeMS: jest.fn(), setOptions: jest.fn().mockResolvedValue(1) };
  countQuery.maxTimeMS.mockReturnValue(countQuery);
  Log.find.mockReturnValue(pageQuery);
  Log.countDocuments.mockReturnValue(countQuery);
  const result = await listLogs({ filter: { level: 'error' }, page: 2, limit: 10 }, 1234);
  expect(pageQuery.maxTimeMS).toHaveBeenCalledWith(1234);
  expect(countQuery.maxTimeMS).toHaveBeenCalledWith(1234);
  expect(pageQuery.setOptions).toHaveBeenCalledWith({ timeoutMS: 1234 });
  expect(countQuery.setOptions).toHaveBeenCalledWith({ timeoutMS: 1234 });
  expect(pageQuery.skip).toHaveBeenCalledWith(10);
  expect(result.data[0].id).toBe('demo');
});
