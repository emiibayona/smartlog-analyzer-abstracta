const mongoose = require('mongoose');
const { loadEnvironment } = require('./config/environment');
const { log, errorDetails } = require('./utils/logger');

async function start() {
  const config = loadEnvironment();
  const app = require('./app');
  const { port, host } = config;
  app.locals.queryTimeoutMs = config.queryTimeoutMs;
  app.locals.healthTimeoutMs = config.healthTimeoutMs;
  await mongoose.connect(config.mongodbUri, { serverSelectionTimeoutMS: 10000, bufferCommands: false });
  await require('../db/models/log').createIndexes();
  await require('../db/models/analysis').Analysis.createIndexes();
  await require('../db/models/rejectedLog').createIndexes();
  const server = app.listen(port, host, () => {
    log('info', 'server_started', { host, port });
  });
  server.on('error', (error) => {
    log('error', 'server_failed', { error: errorDetails(error) });
    mongoose.disconnect().finally(() => process.exit(1));
  });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      const timeout = setTimeout(() => process.exit(1), 10000);
      timeout.unref();
      log('info', 'server_stopping', { signal });
      server.close(() => mongoose.disconnect().then(() => process.exit(0)).catch((error) => {
        log('error', 'shutdown_failed', { error: errorDetails(error) });
        process.exit(1);
      }));
    });
  }
}

start().catch((error) => {
  log('error', 'startup_failed', { error: errorDetails(error) });
  mongoose.disconnect().finally(() => process.exit(1));
});
