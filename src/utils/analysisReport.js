const { AnalysisError } = require('./analysisErrors');

const findingCategories = Object.freeze(['latency', 'availability', 'data-integrity', 'capacity', 'configuration', 'other']);

const findingSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 160 },
    category: { type: 'string', enum: findingCategories },
    severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
    description: { type: 'string', minLength: 1, maxLength: 2000 },
    recommendation: { type: 'string', minLength: 1, maxLength: 2000 },
    evidenceLogIds: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string' } },
  },
  required: ['title', 'category', 'severity', 'description', 'recommendation', 'evidenceLogIds'],
};
const reportSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 4000 },
    patterns: { type: 'array', maxItems: 10, items: findingSchema },
    commonIssues: { type: 'array', maxItems: 10, items: findingSchema },
    insights: { type: 'array', maxItems: 10, items: findingSchema },
  },
  required: ['summary', 'patterns', 'commonIssues', 'insights'],
};

function redactSecrets(value) {
  return value
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, '$1[REDACTED]')
    .replace(/\b((?:password|passwd|secret|token|api[_-]?key|authorization)["']?\s*[:=]\s*)(["'])([^"']*)\2/gi, '$1$2[REDACTED]$2')
    .replace(/\b((?:password|passwd|secret|token|api[_-]?key|authorization)["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi, '$1[REDACTED]')
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}/g, '[REDACTED]');
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function text(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }

// Validate provider output again locally, including evidence references that JSON Schema cannot enforce.
function validateReport(report, allowedIds) {
  const invalid = () => { throw new AnalysisError('INVALID_RESPONSE'); };
  if (!exactKeys(report, ['summary', 'patterns', 'commonIssues', 'insights']) || !text(report.summary, 4000)) invalid();
  const allowed = new Set(allowedIds);
  const result = { summary: redactSecrets(report.summary) };
  for (const key of ['patterns', 'commonIssues', 'insights']) {
    if (!Array.isArray(report[key]) || report[key].length > 10) invalid();
    result[key] = report[key].map((finding) => {
      if (!exactKeys(finding, ['title', 'category', 'severity', 'description', 'recommendation', 'evidenceLogIds']) ||
          !text(finding.title, 160) || !text(finding.description, 2000) || !text(finding.recommendation, 2000) ||
          !findingCategories.includes(finding.category) ||
          !['info', 'warning', 'critical'].includes(finding.severity) ||
          !Array.isArray(finding.evidenceLogIds) || !finding.evidenceLogIds.length || finding.evidenceLogIds.length > 500 ||
          finding.evidenceLogIds.some((id) => typeof id !== 'string' || !allowed.has(id)) ||
          new Set(finding.evidenceLogIds).size !== finding.evidenceLogIds.length) invalid();
      return { ...finding, title: redactSecrets(finding.title), description: redactSecrets(finding.description), recommendation: redactSecrets(finding.recommendation) };
    });
  }
  return result;
}

module.exports = { reportSchema, validateReport, redactSecrets, findingCategories };
