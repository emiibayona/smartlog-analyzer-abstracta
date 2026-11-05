const config = {
  apiKey: 'synthetic-test-key', model: 'test-model', mode: 'synthesis', requestTimeoutMs: 2000, totalTimeoutMs: 10000,
  chunkBytes: 24000, maxLogs: 500, maxBatchBytes: 256000, maxChunks: 20, persistenceTimeoutMs: 5000,
};
function inputLogs() {
  return [
    { microservice: 'inventory-service', date: '2026-11-05T12:00:00Z', level: 'error', message: 'Synthetic inventory lock timeout token=synthetic-secret' },
    { microservice: 'replenishment-service', date: '2026-11-05T12:01:00Z', level: 'error', message: 'Synthetic restock failed after inventory lock timeout' },
  ];
}
function report(ids = ['input-1', 'input-2']) {
  return {
    summary: 'Repeated inventory lock timeouts correlate with restock failures.',
    patterns: [{ title: 'Inventory lock timeouts', severity: 'warning', description: 'Lock timeouts recur in the provided evidence.', recommendation: 'Inspect lock contention and retry metrics.', evidenceLogIds: ids }],
    commonIssues: [], insights: [],
  };
}
module.exports = { config, inputLogs, report };
