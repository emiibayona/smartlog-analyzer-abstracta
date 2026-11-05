const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

async function startAnalysisApi(endpoint, overrides = {}) {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const env = { ...process.env, NODE_ENV: 'test', HOST: '127.0.0.1', PORT: String(port),
    GEMINI_API_KEY: 'synthetic-key', GEMINI_MODEL: 'test-model', ANALYSIS_MODE: 'synthesis',
    ANALYSIS_REQUEST_TIMEOUT_MS: '400', ANALYSIS_TOTAL_TIMEOUT_MS: '5000', ANALYSIS_HTTP_TIMEOUT_MS: '3000',
    TEST_GEMINI_ENDPOINT: endpoint, ...overrides };
  const script = `
    const app = require('./src/app');
    const { loadAnalysisEnvironment } = require('./src/config/analysisEnvironment');
    const { createGeminiAnalysisAdapter } = require('./src/services/geminiAnalysisAdapter');
    if (process.env.GEMINI_API_KEY) {
      const config = loadAnalysisEnvironment();
      app.locals.analysisOptions = {config, provider:createGeminiAnalysisAdapter(config,{endpoint:process.env.TEST_GEMINI_ENDPOINT})};
    }
    require('./src/server');
  `;
  const child = spawn(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '../..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = new Promise((resolve) => child.once('close', resolve));
  child.stderr.resume();
  async function close() {
    if (child.exitCode === null) child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  }
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => finish(new Error('Test API startup timed out')), 20000);
      const finish = (error) => {
        clearTimeout(timer); child.stdout.off('data', onData); child.off('error', onError); child.off('exit', onExit);
        if (error) reject(error); else resolve();
      };
      const onData = (chunk) => { output = (output + chunk).slice(-8192); if (output.includes('"event":"server_started"')) finish(); };
      const onError = () => finish(new Error('Test API spawn failed'));
      const onExit = (code) => finish(new Error(`Test API exited: ${code}`));
      child.stdout.on('data', onData); child.once('error', onError); child.once('exit', onExit);
    });
    child.stdout.resume();
    return { baseUrl: `http://127.0.0.1:${port}`, close };
  } catch (error) { await close(); throw error; }
}

module.exports = { startAnalysisApi };
