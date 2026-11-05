const Log = require('../../db/models/log');

// Retrieve a stable page of matching logs and metadata for the same filter.
async function listLogs({ filter, page, limit }, timeoutMs = 5000) {
  const [logs, total] = await Promise.all([
    Log.find(filter).sort({ date: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
      .maxTimeMS(timeoutMs).setOptions({ timeoutMS: timeoutMs }).lean(),
    Log.countDocuments(filter).maxTimeMS(timeoutMs).setOptions({ timeoutMS: timeoutMs }),
  ]);
  return {
    data: logs.map(({ _id, __v, ...log }) => ({ ...log, id: _id.toString() })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

module.exports = { listLogs };
