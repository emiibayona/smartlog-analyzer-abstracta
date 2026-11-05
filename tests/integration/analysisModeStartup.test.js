const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('invalid mode in an actual environment file does not crash the API', { timeout: 60000 }, async (t) => {
  assert.match(process.env.MONGODB_URI || '', /\/[^/?]*_test(?:\?|$)/, 'Use an isolated test database');
  for (const mode of ['INVALID MODE', '']) {
    await t.test(`API remains available with ${mode ? 'invalid' : 'empty'} mode`, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'smartlog-mode-'));
      let child;
      let exited;
      try {
        const file = path.join(directory, '.env');
        await writeFile(file, `ANALYSIS_MODE="${mode}"\nGEMINI_API_KEY=synthetic-key\nGEMINI_MODEL=test-model\n`, { mode: 0o600 });
        const port = await availablePort();
        const env = { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test' };
        // Let Node load these exclusively from the temporary .env, never the developer's key.
        for (const key of ['ANALYSIS_MODE', 'GEMINI_API_KEY', 'GEMINI_MODEL']) delete env[key];
        const script = `
          const { analyzeLogs } = require('./src/services/analysisEngine');
          analyzeLogs([]).then(() => process.exit(2)).catch(error => {
            if (error.message !== 'Invalid ANALYSIS_MODE') process.exit(3);
            require('./src/server');
          });
        `;
        child = spawn(process.execPath, [`--env-file=${file}`, '-e', script], {
          cwd: path.resolve(__dirname, '../..'), env, stdio: ['ignore', 'pipe', 'pipe'],
        });
        exited = new Promise((resolve) => child.once('exit', resolve));
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => finish(new Error('API startup timed out')), 20000);
          let output = '';
          const finish = (error) => {
            clearTimeout(timer);
            child.stdout.off('data', onData);
            child.off('exit', onExit);
            child.off('error', onError);
            if (error) reject(error); else resolve();
          };
          const onData = (data) => {
            output = (output + data).slice(-8192);
            if (output.includes('"event":"server_started"')) finish();
          };
          const onExit = (code) => finish(new Error(`API exited during startup: ${code}`));
          const onError = () => finish(new Error('Unable to spawn API process'));
          child.stdout.on('data', onData);
          child.once('exit', onExit);
          child.once('error', onError);
        });
        child.stderr.resume();
        for (const endpoint of ['/api', '/api/health']) {
          const response = await fetch(`http://127.0.0.1:${port}${endpoint}`, { signal: AbortSignal.timeout(5000) });
          assert.equal(response.status, 200);
          if (endpoint === '/api') assert.equal(await response.text(), 'OK');
          else assert.deepEqual(await response.json(), { status: 'ok' });
        }
        assert.equal(child.exitCode, null, 'API process should remain running');
      } finally {
        if (child && child.exitCode === null) {
          child.kill('SIGTERM');
          const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
          try { await exited; } finally { clearTimeout(timer); }
        }
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});
