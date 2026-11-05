function integer(env, key, fallback, min, max) {
  const value = env[key] === undefined ? fallback : Number(env[key]);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}`);
  return value;
}

// Optional engine configuration is validated on invocation, not during ordinary API startup.
function loadAnalysisEnvironment(env = process.env) {
  if (typeof env.GEMINI_API_KEY !== 'string' || !env.GEMINI_API_KEY.trim()) throw new Error('GEMINI_API_KEY is required for analysis');
  if (typeof env.GEMINI_MODEL !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(env.GEMINI_MODEL)) throw new Error('GEMINI_MODEL is required for analysis');
  const mode = env.ANALYSIS_MODE ?? 'synthesis';
  if (typeof mode !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(mode)) throw new Error('Invalid ANALYSIS_MODE');
  return {
    apiKey: env.GEMINI_API_KEY.trim(), model: env.GEMINI_MODEL, mode,
    requestTimeoutMs: integer(env, 'ANALYSIS_REQUEST_TIMEOUT_MS', 30000, 1, 120000),
    totalTimeoutMs: integer(env, 'ANALYSIS_TOTAL_TIMEOUT_MS', 120000, 1, 600000),
    chunkBytes: integer(env, 'ANALYSIS_CHUNK_BYTES', 24000, 1024, 64000),
    maxLogs: 500, maxBatchBytes: 256000, maxChunks: 20, persistenceTimeoutMs: 5000,
  };
}

module.exports = { loadAnalysisEnvironment };
