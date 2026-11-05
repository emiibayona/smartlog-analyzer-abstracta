const microservices = ['inventory-service', 'replenishment-service', 'cycle-counting-service', 'slotting-service'];

function validateLogBody(body) {
  const issues = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { issues: ['Body must be a JSON object'] };
  }
  const allowed = ['microservice', 'date', 'level', 'message', 'payload'];
  if (Object.keys(body).some((key) => !allowed.includes(key))) issues.push('Unknown fields are not allowed');
  if (typeof body.microservice !== 'string' || !microservices.includes(body.microservice)) issues.push('microservice must be a supported service name');
  if (typeof body.level !== 'string' || !['info', 'warn', 'error'].includes(body.level)) issues.push('level must be info, warn, or error');
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 16384) issues.push('message must be a non-empty string of at most 16384 characters');
  if (Object.hasOwn(body, 'payload') && (typeof body.payload !== 'string' || !body.payload.trim() || body.payload.length > 4096)) issues.push('payload must be a non-empty file reference string of at most 4096 characters');
  const match = typeof body.date === 'string' && body.date.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,3})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
  const day = match && new Date(`${match[1]}T00:00:00.000Z`);
  if (!match || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== match[1] || Number.isNaN(Date.parse(body.date))) {
    issues.push('date must be a valid ISO timestamp with timezone and at most millisecond precision');
  }
  if (issues.length) return { issues };
  const value = { microservice: body.microservice, date: new Date(body.date), level: body.level, message: body.message.trim() };
  if (Object.hasOwn(body, 'payload')) value.payload = body.payload.trim();
  return { issues, value };
}

module.exports = { validateLogBody, microservices };
