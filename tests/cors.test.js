const request = require('supertest');

const originalOrigins = process.env.CORS_ALLOWED_ORIGINS;

afterEach(() => {
  if (originalOrigins === undefined) {
    delete process.env.CORS_ALLOWED_ORIGINS;
  } else {
    process.env.CORS_ALLOWED_ORIGINS = originalOrigins;
  }
  jest.resetModules();
});

function loadApp(origins) {
  jest.resetModules();
  if (origins === undefined) {
    delete process.env.CORS_ALLOWED_ORIGINS;
  } else {
    process.env.CORS_ALLOWED_ORIGINS = origins;
  }
  return require('../src/app');
}

test('defaults to localhost:3000', async () => {
  const response = await request(loadApp()).get('/api').set('Origin', 'http://localhost:3000');
  expect(response.status).toBe(200);
  expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  expect(response.headers.vary).toContain('Origin');
});

test('accepts comma-separated configured origins and handles preflight', async () => {
  const app = loadApp(' http://localhost:5173, http://localhost:8080 ');
  for (const origin of ['http://localhost:5173', 'http://localhost:8080']) {
    const response = await request(app).options('/api')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-methods']).toContain('GET');
    expect(response.headers['access-control-allow-headers']).toBe('content-type');
  }
});

test.each(['https://example.com', 'http://localhost:3001', 'http://localhost.evil.com', 'null'])(
  'does not grant CORS access to %s', async (origin) => {
    const app = loadApp();
    const response = await request(app).get('/api').set('Origin', origin);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    const preflight = await request(app).options('/api')
      .set('Origin', origin).set('Access-Control-Request-Method', 'GET');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  },
);

test('empty allowlist disables CORS access', async () => {
  const response = await request(loadApp('')).get('/api').set('Origin', 'http://localhost:3000');
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
});

test('requests without Origin still work', async () => {
  const response = await request(loadApp()).get('/api');
  expect(response.status).toBe(200);
  expect(response.text).toBe('OK');
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
});
