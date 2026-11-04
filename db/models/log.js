const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  microservice: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  level: { type: String, required: true, enum: ['info', 'warn', 'error'] },
  payload: { type: String },
  message: { type: String, required: true, trim: true },
}, { toJSON: { virtuals: true } });

module.exports = mongoose.model('Log', logSchema);
