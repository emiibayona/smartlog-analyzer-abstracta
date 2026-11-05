const Log = require('../../db/models/log');
const { parseLogQuery } = require('../utils/logQuery');

function buildAggregationPipeline(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some((key) => !['from', 'to', 'microservice', 'level'].includes(key))) {
    throw new Error('Unsupported aggregation options');
  }
  const common = {};
  for (const key of ['microservice', 'level']) if (Object.hasOwn(options, key)) common[key] = options[key];
  const filter = parseLogQuery(common).filter;
  let start;
  let end;
  if (Object.hasOwn(options, 'from')) start = parseLogQuery({ date: options.from }).filter.date.$gte;
  if (Object.hasOwn(options, 'to')) end = parseLogQuery({ date: options.to }).filter.date.$gte;
  if (start && end && start > end) throw new Error('from must not be after to');
  if (start || end) {
    filter.date = {};
    if (start) filter.date.$gte = start;
    if (end) filter.date.$lt = new Date(end.getTime() + 86400000);
  }
  return [
    { $match: filter },
    { $group: { _id: { microservice: '$microservice', level: '$level' }, count: { $sum: 1 } } },
    { $project: { _id: 0, microservice: '$_id.microservice', level: '$_id.level', count: 1 } },
    { $sort: { microservice: 1, level: 1 } },
  ];
}

// Count logs by service and level in MongoDB without loading individual logs or changing data.
async function aggregateLogs(options = {}, timeoutMS = 5000, model = Log) {
  const pipeline = buildAggregationPipeline(options);
  if (!Number.isSafeInteger(timeoutMS) || timeoutMS < 1 || timeoutMS > 60000) throw new Error('Invalid aggregation timeout');
  const groups = await model.aggregate(pipeline).option({ maxTimeMS: timeoutMS, timeoutMS }).exec();
  return { totalLogs: groups.reduce((total, group) => total + group.count, 0), groups };
}

module.exports = { aggregateLogs, buildAggregationPipeline };
