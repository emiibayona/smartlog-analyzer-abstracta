const http = require('node:http');
const { report } = require('./analysisEngineFixtures');

async function startOpenAIStub(mode = 'valid') {
  const requests = [];
  const timers = new Set();
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    requests.push({ method: req.method, url: req.url, body: request, authorization: req.headers.authorization });
    const input = JSON.parse(request.input[0].content);
    const ids = input.phase === 'chunk' ? input.logs.map((entry) => entry.id) : input.evidenceLogIds;
    const finding = report(ids);
    if (mode === 'timeout') {
      const timer = setTimeout(() => { timers.delete(timer); res.end('{}'); }, 1000);
      timers.add(timer);
      return;
    }
    if (mode === 'http-error') { res.writeHead(500); res.end('private-provider-error'); return; }
    if (mode === 'http-auth') { res.writeHead(401); res.end('private-provider-error'); return; }
    if (mode === 'http-rate-limit') { res.writeHead(429); res.end('private-provider-error'); return; }
    if (mode === 'malformed-envelope') { res.end('not-json'); return; }
    if (mode === 'oversized-response') { res.end('x'.repeat(256001)); return; }
    const content = mode === 'refusal' ? [{ type: 'refusal', refusal: 'synthetic refusal' }] : [{ type: 'output_text', text: mode === 'invalid-json' ? '{bad' : JSON.stringify(mode === 'wrong-format' ? { unexpected: true } : finding) }];
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: mode === 'incomplete' ? 'incomplete' : 'completed', output: [{ type: 'message', role: 'assistant', content }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    endpoint: `http://127.0.0.1:${server.address().port}/v1/responses`, requests,
    async close() {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { startOpenAIStub };
