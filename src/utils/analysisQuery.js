const { parseLogQuery } = require('./logQuery');
const { analysisStatuses } = require('../../db/models/analysis');

function parseAnalysisQuery(query) {
  const { status, ...common } = query;
  if (Object.hasOwn(common, 'level')) {
    throw Object.assign(new Error('Invalid query parameter: level'), { status: 400 });
  }
  const parsed = parseLogQuery(common);
  if (Object.hasOwn(query, 'status')) {
    if (typeof status !== 'string' || !analysisStatuses.includes(status)) {
      throw Object.assign(new Error('status must be Pending, In progress, or Completed'), { status: 400 });
    }
    parsed.filter.status = status;
  }
  return parsed;
}

function parseAnalysisId(id) {
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    throw Object.assign(new Error('id must be a 24-character hexadecimal ObjectId'), { status: 400 });
  }
  return id;
}

module.exports = { parseAnalysisQuery, parseAnalysisId };
