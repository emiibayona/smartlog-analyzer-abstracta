const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  microservice: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  level: { type: String, required: true, enum: ['info', 'warn', 'error'] },
  payload: { type: String },
  message: { type: String, required: true, trim: true },
}, { toJSON: { virtuals: true } });

logSchema.index({ date: -1, _id: -1 });
logSchema.index({ microservice: 1, date: -1, _id: -1 });
logSchema.index({ microservice: 1, level: 1, date: -1, _id: -1 });
logSchema.index({ level: 1, date: -1, _id: -1 });

module.exports = mongoose.model('Log', logSchema);
