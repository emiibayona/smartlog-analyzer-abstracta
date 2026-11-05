const { Analysis } = require('../db/models/analysis');
const { createAnalysisRepository } = require('../src/repositories/analysisRepository');
const id = 'abcdef123456abcdef123456';
afterEach(() => jest.restoreAllMocks());
test('repository creates acknowledged validated records with a write deadline', async () => {
  const insert = jest.spyOn(Analysis.collection, 'insertOne').mockResolvedValue({ acknowledged: true });
  const result = await createAnalysisRepository(1234).create({ microservice: 'inventory-service', date: new Date(), status: 'Pending' });
  expect(result).toMatch(/^[a-f0-9]{24}$/);
  expect(insert.mock.calls[0][1]).toEqual({ timeoutMS: 1234, writeConcern: { w: 1 } });
});
test('invalid records never reach the database', async () => {
  const insert = jest.spyOn(Analysis.collection, 'insertOne');
  await expect(createAnalysisRepository().create({ status: 'invalid' })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
  expect(insert).not.toHaveBeenCalled();
});
test.each([{ acknowledged: false }, { acknowledged: true, matchedCount: 0 }])('unconfirmed updates are persistence failures: %j', async (result) => {
  jest.spyOn(Analysis.collection, 'updateOne').mockResolvedValue(result);
  await expect(createAnalysisRepository().update(id, { status: 'Completed' })).rejects.toMatchObject({ code: 'PERSISTENCE_FAILED' });
});
test('failed-state writes clear any ambiguous partial result', async () => {
  const update = jest.spyOn(Analysis.collection, 'updateOne').mockResolvedValue({ acknowledged: true, matchedCount: 1 });
  await createAnalysisRepository().update(id, { status: 'Failed' }, true);
  expect(update.mock.calls[0][1].$unset).toEqual({ result: '', message: '', report: '' });
});
