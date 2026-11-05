const { Analysis } = require('../../db/models/analysis');

function serializeAnalysis({ _id, __v, ...analysis }) {
  return { ...analysis, id: _id.toString() };
}

// List matching analyses in stable newest-first order with bounded page/count queries.
async function listAnalyses({ filter, page, limit }, timeoutMs = 5000) {
  const [analyses, total] = await Promise.all([
    Analysis.find(filter).sort({ date: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
      .maxTimeMS(timeoutMs).setOptions({ timeoutMS: timeoutMs }).lean(),
    Analysis.countDocuments(filter).maxTimeMS(timeoutMs).setOptions({ timeoutMS: timeoutMs }),
  ]);
  return { data: analyses.map(serializeAnalysis), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// Retrieve a single analysis without exposing storage-specific fields.
async function findAnalysis(id, timeoutMs = 5000) {
  const analysis = await Analysis.findById(id).maxTimeMS(timeoutMs).setOptions({ timeoutMS: timeoutMs }).lean();
  if (!analysis) throw Object.assign(new Error('Analysis not found'), { status: 404 });
  return serializeAnalysis(analysis);
}

module.exports = { listAnalyses, findAnalysis };
