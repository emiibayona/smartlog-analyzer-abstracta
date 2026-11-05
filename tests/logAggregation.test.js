const { buildAggregationPipeline, aggregateLogs } = require('../src/services/logAggregationService');
const { parseArguments } = require('../db/aggregateLogs');

test('unfiltered aggregation groups by service and level with deterministic ordering', () => {
  const pipeline = buildAggregationPipeline();
  expect(pipeline[0]).toEqual({ $match: {} });
  expect(pipeline[1].$group._id).toEqual({ microservice: '$microservice', level: '$level' });
  expect(pipeline.at(-1)).toEqual({ $sort: { microservice: 1, level: 1 } });
});
test('date ranges include both UTC days and combine service/level filters', () => {
  const pipeline = buildAggregationPipeline({ from: '2026-11-04', to: '2026-11-05', microservice: 'inventory-service', level: 'error' });
  expect(pipeline[0].$match).toEqual({ microservice: 'inventory-service', level: 'error', date: {
    $gte: new Date('2026-11-04T00:00:00Z'), $lt: new Date('2026-11-06T00:00:00Z'),
  } });
});
test('one-sided and leap-day bounds are valid', () => {
  expect(buildAggregationPipeline({ from: '2028-02-29' })[0].$match.date).toEqual({ $gte: new Date('2028-02-29T00:00:00Z') });
  expect(buildAggregationPipeline({ to: '2028-02-29' })[0].$match.date).toEqual({ $lt: new Date('2028-03-01T00:00:00Z') });
});
test.each([null, [], { unknown: 'x' }, { from: '' }, { from: '2026-02-30' }, { to: '2026-13-01' }, { from: '2026-11-06', to: '2026-11-05' }, { level: 'invalid' }, { microservice: '' }, { from: ['2026-11-05'] }])('invalid filters fail before querying: %#', (filters) => {
  expect(() => buildAggregationPipeline(filters)).toThrow();
});
test('database work has server/client deadlines and returns totals without raw documents', async () => {
  const exec = jest.fn().mockResolvedValue([{ microservice: 'inventory-service', level: 'error', count: 2 }, { microservice: 'inventory-service', level: 'info', count: 3 }]);
  const option = jest.fn(() => ({ exec }));
  const model = { aggregate: jest.fn(() => ({ option })) };
  expect(await aggregateLogs({}, 1234, model)).toEqual({ totalLogs: 5, groups: [
    { microservice: 'inventory-service', level: 'error', count: 2 }, { microservice: 'inventory-service', level: 'info', count: 3 },
  ] });
  expect(option).toHaveBeenCalledWith({ maxTimeMS: 1234, timeoutMS: 1234 });
  exec.mockResolvedValue([]);
  expect(await aggregateLogs({}, 1234, model)).toEqual({ totalLogs: 0, groups: [] });
  exec.mockRejectedValue(new Error('query timeout'));
  await expect(aggregateLogs({}, 1234, model)).rejects.toThrow('query timeout');
});
test.each([0, -1, 60001, 1.5, NaN])('invalid timeout %s prevents database access', async (timeout) => {
  const model = { aggregate: jest.fn() };
  await expect(aggregateLogs({}, timeout, model)).rejects.toThrow('Invalid aggregation timeout');
  expect(model.aggregate).not.toHaveBeenCalled();
});
test('CLI supports help, filters and long-form options', () => {
  expect(parseArguments(['-h'])).toEqual({ help: true, filters: {} });
  expect(parseArguments(['--from=2026-11-04', '--to', '2026-11-05', '--microservice', 'inventory-service', '--level', 'warn']).filters).toEqual({ from: '2026-11-04', to: '2026-11-05', microservice: 'inventory-service', level: 'warn' });
});
test.each([['--unknown'], ['positional'], ['--from'], ['--from', '2026-11-04', '--from', '2026-11-05'], ['--level', 'invalid']])('CLI rejects malformed flags: %j', (...args) => {
  expect(() => parseArguments(args)).toThrow();
});
