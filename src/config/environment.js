function positiveInteger(value, fallback, maximum, name) {
  const text = value === undefined ? String(fallback) : value;
  const number = Number(text);
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(number) || number > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return number;
}

function corsOrigins(value = 'http://localhost:3000') {
  return value.split(',').map((origin) => origin.trim()).filter(Boolean).map((origin) => {
    let url;
    try { url = new URL(origin); } catch { throw new Error('Invalid CORS_ALLOWED_ORIGINS'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
      throw new Error('CORS_ALLOWED_ORIGINS must contain exact HTTP(S) origins');
    }
    return origin;
  });
}

function loadEnvironment(env = process.env) {
  const uri = env.MONGODB_URI;
  // Check URI structure without printing credentials in configuration errors.
  if (!uri || !/^mongodb(?:\+srv)?:\/\/[^\s/?#]+(?:\/[^\s?#]*)?(?:\?[^\s#]*)?$/.test(uri)) {
    throw new Error('MONGODB_URI must be a MongoDB connection URI');
  }
  try { new (require('mongoose').mongo.MongoClient)(uri); }
  catch { throw new Error('MONGODB_URI must be a valid MongoDB connection URI'); }
  if (env.HOST !== undefined && !env.HOST.trim()) throw new Error('HOST must not be empty');
  return {
    mongodbUri: uri,
    host: env.HOST || '0.0.0.0',
    port: positiveInteger(env.PORT, 3000, 65535, 'PORT'),
    queryTimeoutMs: positiveInteger(env.QUERY_TIMEOUT_MS, 5000, 60000, 'QUERY_TIMEOUT_MS'),
    healthTimeoutMs: positiveInteger(env.HEALTH_TIMEOUT_MS, 2000, 10000, 'HEALTH_TIMEOUT_MS'),
    allowedOrigins: corsOrigins(env.CORS_ALLOWED_ORIGINS),
  };
}

module.exports = { loadEnvironment, corsOrigins };
