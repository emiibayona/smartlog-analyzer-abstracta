jest.mock('../db/models/analysis', () => ({ Analysis: { find: jest.fn(), countDocuments: jest.fn(), findById: jest.fn() } }));
const { Analysis } = require('../db/models/analysis');
const { listAnalyses, findAnalysis } = require('../src/services/analysisService');

function query(result) {
  const chain = {};
  for (const key of ['sort', 'skip', 'limit', 'maxTimeMS', 'setOptions']) chain[key] = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockResolvedValue(result);
  return chain;
}
test('list applies stable ordering, pagination and both deadlines', async () => {
  const page = query([{ _id: 'demo-id', __v: 0, status: 'Pending' }]);
  const count = query();
  count.setOptions.mockResolvedValue(1);
  Analysis.find.mockReturnValue(page);
  Analysis.countDocuments.mockReturnValue(count);
  const result = await listAnalyses({ filter: { status: 'Pending' }, page: 2, limit: 10 }, 1234);
  expect(page.sort).toHaveBeenCalledWith({ date: -1, _id: -1 });
  expect(page.skip).toHaveBeenCalledWith(10);
  expect(page.maxTimeMS).toHaveBeenCalledWith(1234);
  expect(count.maxTimeMS).toHaveBeenCalledWith(1234);
  expect(page.setOptions).toHaveBeenCalledWith({ timeoutMS: 1234 });
  expect(count.setOptions).toHaveBeenCalledWith({ timeoutMS: 1234 });
  expect(result.data).toEqual([{ id: 'demo-id', status: 'Pending' }]);
});
test('lookup has deadlines and missing IDs produce 404', async () => {
  const lookup = query(null);
  Analysis.findById.mockReturnValue(lookup);
  await expect(findAnalysis('demo', 1234)).rejects.toMatchObject({ status: 404 });
  expect(lookup.maxTimeMS).toHaveBeenCalledWith(1234);
  expect(lookup.setOptions).toHaveBeenCalledWith({ timeoutMS: 1234 });
  lookup.lean.mockResolvedValue({ _id: 'demo', __v: 0, result: 'summary' });
  expect(await findAnalysis('demo')).toEqual({ id: 'demo', result: 'summary' });
});
