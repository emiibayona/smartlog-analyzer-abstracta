const { validateLogBody } = require('./logBody');

function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function validateEnvelope(body, field) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, field)) {
    throw invalid(`Body must contain only ${field}`);
  }
  const items = body[field];
  if (!Array.isArray(items) || !items.length || items.length > 500) throw invalid(`${field} must contain between 1 and 500 entries`);
  return items;
}

function parseRawAnalysis(body) {
  const logs = validateEnvelope(body, 'logs');
  for (let index = 0; index < logs.length; index++) {
    const issues = validateLogBody(logs[index]).issues;
    if (issues.length) throw invalid(`Invalid log at index ${index}: ${issues.join('; ')}`);
  }
  return logs;
}

function parseStoredAnalysis(body) {
  const ids = validateEnvelope(body, 'ids');
  if (ids.some((id) => typeof id !== 'string' || !/^[a-fA-F0-9]{24}$/.test(id))) throw invalid('ids must be 24-character hexadecimal ObjectIds');
  const normalized = ids.map((id) => id.toLowerCase());
  if (new Set(normalized).size !== normalized.length) throw invalid('Duplicate log IDs are not allowed');
  return normalized;
}

module.exports = { parseRawAnalysis, parseStoredAnalysis };
