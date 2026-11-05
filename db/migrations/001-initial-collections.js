// Versioned snapshot: add a new migration instead of changing an applied version.
const collections = {
  logs: [
    { key: { date: -1, _id: -1 }, name: 'date_-1__id_-1' },
    { key: { microservice: 1, date: -1, _id: -1 }, name: 'microservice_1_date_-1__id_-1' },
    { key: { microservice: 1, level: 1, date: -1, _id: -1 }, name: 'microservice_1_level_1_date_-1__id_-1' },
    { key: { level: 1, date: -1, _id: -1 }, name: 'level_1_date_-1__id_-1' },
  ],
  analyses: [
    { key: { date: -1, _id: -1 }, name: 'date_-1__id_-1' },
    { key: { microservice: 1, date: -1, _id: -1 }, name: 'microservice_1_date_-1__id_-1' },
    { key: { microservice: 1, status: 1, date: -1, _id: -1 }, name: 'microservice_1_status_1_date_-1__id_-1' },
    { key: { status: 1, date: -1, _id: -1 }, name: 'status_1_date_-1__id_-1' },
  ],
  rejected_logs: [
    { key: { receivedAt: -1, _id: -1 }, name: 'receivedAt_-1__id_-1' },
    { key: { requestId: 1 }, name: 'requestId_1' },
  ],
};

async function ensureCollection(db, name, timeoutMS) {
  try { await db.createCollection(name, { timeoutMS }); }
  catch (error) { if (error.code !== 48) throw error; }
}

async function up(db, { timeoutMS }) {
  for (const [name, indexes] of Object.entries(collections)) {
    await ensureCollection(db, name, timeoutMS);
    await db.collection(name).createIndexes(indexes, { timeoutMS });
  }
}

module.exports = { id: '001-initial-collections', up, ensureCollection };
