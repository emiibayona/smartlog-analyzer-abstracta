const { validateLogBody } = require('./logBody');
const { redactSecrets } = require('./analysisReport');
const { AnalysisError } = require('./analysisErrors');

function prepareAnalysisInput(logs, config) {
  if (!Array.isArray(logs) || !logs.length || logs.length > config.maxLogs) throw new AnalysisError('INVALID_INPUT');
  const references = [];
  const logIds = [];
  const services = new Set();
  const input = logs.map((entry, index) => {
    const value = entry && typeof entry.toObject === 'function' ? entry.toObject() : entry;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AnalysisError('INVALID_INPUT');
    const { id, _id, __v, ...body } = value;
    if (body.date instanceof Date) {
      if (Number.isNaN(body.date.getTime())) throw new AnalysisError('INVALID_INPUT');
      body.date = body.date.toISOString();
    }
    const validated = validateLogBody(body);
    if (validated.issues.length) throw new AnalysisError('INVALID_INPUT');
    const storedId = id ?? _id;
    if (id !== undefined && _id !== undefined && String(id).toLowerCase() !== String(_id).toLowerCase()) throw new AnalysisError('INVALID_INPUT');
    let referenceId = `input-${index + 1}`;
    if (storedId !== undefined) {
      const stringId = String(storedId);
      if (!/^[a-fA-F0-9]{24}$/.test(stringId)) throw new AnalysisError('INVALID_INPUT');
      const normalized = stringId.toLowerCase();
      logIds.push(normalized);
      referenceId = `log-${normalized}`;
    }
    if (references.includes(referenceId)) throw new AnalysisError('INVALID_INPUT');
    references.push(referenceId);
    services.add(body.microservice);
    // Send message content, never raw file references or arbitrary input fields.
    return { id: referenceId, microservice: body.microservice, date: validated.value.date.toISOString(), level: body.level, message: redactSecrets(validated.value.message) };
  });
  if (Buffer.byteLength(JSON.stringify(input)) > config.maxBatchBytes) throw new AnalysisError('INPUT_TOO_LARGE');
  const chunks = [];
  let current = [];
  for (const entry of input) {
    if (Buffer.byteLength(JSON.stringify([entry])) > config.chunkBytes) throw new AnalysisError('INPUT_TOO_LARGE');
    if (Buffer.byteLength(JSON.stringify([...current, entry])) > config.chunkBytes) {
      chunks.push(current);
      current = [];
    }
    current.push(entry);
  }
  if (current.length) chunks.push(current);
  if (chunks.length > config.maxChunks) throw new AnalysisError('INPUT_TOO_LARGE');
  return { input, chunks, references, logIds, microservices: [...services] };
}

module.exports = { prepareAnalysisInput };
