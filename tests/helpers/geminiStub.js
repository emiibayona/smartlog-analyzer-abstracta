const http = require('node:http');
const { report } = require('./analysisEngineFixtures');

async function startGeminiStub(mode = 'valid') {
  const requests = [];
  const timers = new Set();
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const request = JSON.parse(body);
    requests.push({ method: req.method, url: req.url, body: request, apiKey: req.headers['x-goog-api-key'] });
    const input = JSON.parse(request.contents[0].parts[0].text);
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
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'refusal') { res.end(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })); return; }
    const text = mode === 'invalid-json' ? '{bad' : JSON.stringify(mode === 'wrong-format' ? { unexpected: true } : finding);
    const parts = mode === 'multipart' ? [{ thought: true, text: 'Internal thought is not a report.' }, { text: text.slice(0, 10) }, { text: text.slice(10) }] : [{ text }];
    const candidate = { finishReason: mode === 'incomplete' ? 'MAX_TOKENS' : mode === 'candidate-block' ? 'SAFETY' : 'STOP', content: { role: 'model', parts } };
    res.end(JSON.stringify({ candidates: mode === 'empty-candidates' ? [] : mode === 'multiple-candidates' ? [candidate, candidate] : [candidate] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    endpoint: `http://127.0.0.1:${server.address().port}/v1beta/models/test-model:generateContent`, requests,
    async close() {
      for (const timer of timers) clearTimeout(timer);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { startGeminiStub };
