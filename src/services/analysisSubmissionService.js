const Log = require('../../db/models/log');
const { analyzeLogs } = require('./analysisEngine');

// Fetch every requested stored log before starting any analysis; maintain client ordering.
async function submitStoredAnalysis(ids, options = {}) {
  const timeoutMs = options.queryTimeoutMs ?? 5000;
  if (options.signal?.aborted) throw options.signal.reason;
  const documents = await Log.find({ _id: { $in: ids } }).maxTimeMS(timeoutMs).setOptions({ timeoutMS: timeoutMs }).lean();
  if (options.signal?.aborted) throw options.signal.reason;
  if (documents.length !== ids.length) throw Object.assign(new Error('One or more stored logs were not found'), { status: 404 });
  const byId = new Map(documents.map((document) => [document._id.toString(), document]));
  return analyzeLogs(ids.map((id) => byId.get(id)), options);
}

module.exports = { submitStoredAnalysis };
