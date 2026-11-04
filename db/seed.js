const mongoose = require('mongoose');
const Log = require('./models/log');
const logs = require('./seeds/logs');

// Insert only missing demo logs, preserving existing records and edited demo data.
async function seedLogs(model = Log) {
  await Promise.all(logs.map((log) => new model(log).validate()));
  return model.bulkWrite(logs.map((log) => ({
    updateOne: {
      filter: { _id: log._id },
      update: { $setOnInsert: log },
      upsert: true,
    },
  })));
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required. Use the Docker seed command or configure .env.');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const result = await seedLogs();
    console.log(`Demo logs: ${result.upsertedCount} inserted, ${result.matchedCount} already present.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(() => {
    console.error('Seeding failed. Check MONGODB_URI, database availability, and log schema.');
    process.exitCode = 1;
  });
}

module.exports = { seedLogs };
