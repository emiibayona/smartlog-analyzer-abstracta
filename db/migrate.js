const mongoose = require('mongoose');
const initialMigration = require('./migrations/001-initial-collections');

const migrations = [initialMigration];

// Apply forward-only, repeatable DDL before recording success; never delete application data.
async function runMigrations(db, versions = migrations, { timeoutMS = 30000 } = {}) {
  if (!Array.isArray(versions) || versions.some((migration) => !migration || !/^\d{3}-[a-z0-9-]+$/.test(migration.id) || typeof migration.up !== 'function')) {
    throw new Error('Invalid migration registry');
  }
  const ids = versions.map((migration) => migration.id);
  if (new Set(ids).size !== ids.length) throw new Error('Invalid migration registry');
  await initialMigration.ensureCollection(db, 'schema_migrations', timeoutMS);
  const history = db.collection('schema_migrations');
  const result = { applied: [], skipped: [] };
  for (const migration of [...versions].sort((a, b) => a.id.localeCompare(b.id))) {
    if (await history.findOne({ _id: migration.id }, { timeoutMS })) {
      result.skipped.push(migration.id);
      continue;
    }
    await migration.up(db, { timeoutMS });
    const recorded = await history.updateOne({ _id: migration.id }, {
      $setOnInsert: { appliedAt: new Date() },
    }, { upsert: true, timeoutMS, writeConcern: { w: 1 } });
    if (!recorded.acknowledged) throw new Error('Migration completion was not acknowledged');
    result.applied.push(migration.id);
  }
  return result;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000, autoCreate: false, autoIndex: false });
    const result = await runMigrations(mongoose.connection.db);
    console.log(`Migrations: ${result.applied.length} applied, ${result.skipped.length} already applied.`);
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) {
  main().catch(() => {
    console.error('Database migration failed. Check database availability and migration compatibility.');
    process.exitCode = 1;
  });
}

module.exports = { runMigrations };
