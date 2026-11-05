const mongoose = require('mongoose');

// Check a live database round trip with both client and server deadlines.
async function checkHealth(timeoutMs = 2000) {
  if (mongoose.connection.readyState !== 1) throw new Error('Database unavailable');
  await mongoose.connection.db.command({ ping: 1 }, { timeoutMS: timeoutMs, maxTimeMS: timeoutMs });
}

module.exports = { checkHealth };
