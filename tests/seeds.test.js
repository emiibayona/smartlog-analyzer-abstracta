const Log = require('../db/models/log');
const logs = require('../db/seeds/logs');

test('demo logs have unique stable IDs and valid schemas', async () => {
  expect(logs).toHaveLength(24);
  expect(new Set(logs.map((log) => log._id)).size).toBe(24);
  await Promise.all(logs.map((log) => new Log(log).validate()));
});

test.each([
  'inventory-service', 'replenishment-service', 'cycle-counting-service', 'slotting-service',
])('%s has successful operations, warnings, repeated failures, and recovery', (microservice) => {
  const serviceLogs = logs.filter((log) => log.microservice === microservice);
  expect(serviceLogs.map((log) => log.level)).toEqual(['info', 'info', 'warn', 'error', 'error', 'info']);
  expect(serviceLogs[3].message).toBe(serviceLogs[4].message);
  expect(serviceLogs[3].date).not.toEqual(serviceLogs[4].date);
});

test.each([
  { level: 'invalid' }, { date: 'invalid' }, { microservice: '' }, { message: '' },
])('invalid log fields fail schema validation: %j', async (overrides) => {
  await expect(new Log({ ...logs[0], ...overrides }).validate()).rejects.toThrow();
});
