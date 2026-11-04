const app = require('./app');
const mongoose = require('mongoose');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

async function start() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(port, host, () => {
    console.log(`API listening on ${host}:${port}`);
  });
  server.on('error', () => {
    console.error('Unable to start API');
    mongoose.disconnect().finally(() => process.exit(1));
  });
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      const timeout = setTimeout(() => process.exit(1), 10000);
      timeout.unref();
      server.close(() => mongoose.disconnect().then(() => process.exit(0)));
    });
  }
}

start().catch(() => {
  console.error('Unable to start API. Check MongoDB configuration and availability.');
  mongoose.disconnect().finally(() => process.exit(1));
});
