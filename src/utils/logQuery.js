function invalidQuery(message) {
  return Object.assign(new Error(message), { status: 400 });
}

function parseLogQuery(query) {
  const allowed = ['date', 'microservice', 'level', 'message', 'page', 'limit'];
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.includes(key) || typeof value !== 'string' || !value.trim()) {
      throw invalidQuery(`Invalid query parameter: ${key}`);
    }
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  for (const key of ['page', 'limit']) {
    if (query[key] !== undefined && !/^[1-9]\d*$/.test(query[key])) {
      throw invalidQuery(`${key} must be a positive integer`);
    }
  }
  if (!Number.isSafeInteger(page) || !Number.isSafeInteger(limit) || limit > 100 ||
      !Number.isSafeInteger((page - 1) * limit)) {
    throw invalidQuery('Invalid pagination; limit must be between 1 and 100');
  }
  const filter = {};
  if (query.date !== undefined) {
    const date = new Date(`${query.date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date) || Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== query.date) {
      throw invalidQuery('date must be a valid YYYY-MM-DD UTC calendar date');
    }
    filter.date = { $gte: date, $lt: new Date(date.getTime() + 86400000) };
  }
  if (query.microservice !== undefined) {
    if (query.microservice.length > 200) throw invalidQuery('microservice must be at most 200 characters');
    filter.microservice = query.microservice;
  }
  if (query.level !== undefined) {
    if (!['info', 'warn', 'error'].includes(query.level)) throw invalidQuery('level must be info, warn, or error');
    filter.level = query.level;
  }
  if (query.message !== undefined) {
    if (query.message.length > 500) throw invalidQuery('message must be at most 500 characters');
    filter.message = { $regex: query.message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }
  return { filter, page, limit };
}

module.exports = { parseLogQuery };
