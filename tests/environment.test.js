const { loadEnvironment, corsOrigins } = require('../src/config/environment');

const base = { MONGODB_URI: 'mongodb://127.0.0.1:27017/smartlog' };
test('configuration has bounded defaults', () => {
  expect(loadEnvironment(base)).toMatchObject({ port: 3000, queryTimeoutMs: 5000, healthTimeoutMs: 2000 });
});
test.each([
  { PORT: '0' }, { PORT: '65536' }, { PORT: 'abc' }, { PORT: '3.5' },
  { QUERY_TIMEOUT_MS: '0' }, { QUERY_TIMEOUT_MS: '60001' },
  { HEALTH_TIMEOUT_MS: '10001' }, { HOST: '' }, { MONGODB_URI: '' },
  { ANALYSIS_HTTP_TIMEOUT_MS: '0' }, { ANALYSIS_HTTP_TIMEOUT_MS: '660001' },
  { MONGODB_URI: 'http://localhost/db' }, { MONGODB_URI: 'mongodb://:27017/db' },
  { CORS_ALLOWED_ORIGINS: '*' }, { CORS_ALLOWED_ORIGINS: 'http://localhost/path' },
  { CORS_ALLOWED_ORIGINS: 'http://user:password@localhost' },
])('invalid configuration fails without exposing values: %j', (overrides) => {
  expect(() => loadEnvironment({ ...base, ...overrides })).toThrow();
});
test('empty CORS allowlist is supported', () => expect(corsOrigins('')).toEqual([]));
test('accepts multiple exact origins', () => {
  expect(corsOrigins('http://localhost:3000, https://localhost:5173')).toHaveLength(2);
});
