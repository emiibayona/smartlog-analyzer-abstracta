const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const { aggregateLogs, buildAggregationPipeline } = require('../src/services/logAggregationService');

function parseArguments(args) {
  const { values, tokens } = parseArgs({ args, strict: true, allowPositionals: false, tokens: true, options: {
    from: { type: 'string' }, to: { type: 'string' },
    microservice: { type: 'string' }, level: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  } });
  const names = tokens.filter((token) => token.kind === 'option').map((token) => token.name);
  if (new Set(names).size !== names.length) throw new Error('Repeated aggregation flags are not allowed');
  const { help = false, ...filters } = values;
  buildAggregationPipeline(filters);
  return { help, filters };
}

async function main() {
  const { help, filters } = parseArguments(process.argv.slice(2));
  if (help) {
    console.log('Usage: npm run aggregate -- [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--microservice NAME] [--level info|warn|error]');
    console.log('Date bounds include both UTC calendar days. Omitted bounds are open-ended. This command is read-only.');
    return;
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const timeoutMS = process.env.QUERY_TIMEOUT_MS === undefined ? 5000 : Number(process.env.QUERY_TIMEOUT_MS);
  if (!Number.isSafeInteger(timeoutMS) || timeoutMS < 1 || timeoutMS > 60000) throw new Error('Invalid QUERY_TIMEOUT_MS');
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, autoCreate: false, autoIndex: false, bufferCommands: false });
    console.log(JSON.stringify(await aggregateLogs(filters, timeoutMS), null, 2));
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) {
  main().catch(() => {
    console.error('Aggregation failed. Check filters, MongoDB configuration, and database availability. Use --help for usage.');
    process.exitCode = 1;
  });
}

module.exports = { parseArguments };
