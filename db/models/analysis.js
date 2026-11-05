const mongoose = require('mongoose');

const analysisStatuses = ['Pending', 'In progress', 'Completed'];
const analysisSchema = new mongoose.Schema({
  microservice: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  result: { type: String },
  message: { type: String, trim: true },
  status: { type: String, required: true, enum: analysisStatuses },
}, { toJSON: { virtuals: true } });

analysisSchema.index({ date: -1, _id: -1 });
analysisSchema.index({ microservice: 1, date: -1, _id: -1 });
analysisSchema.index({ microservice: 1, status: 1, date: -1, _id: -1 });
analysisSchema.index({ status: 1, date: -1, _id: -1 });

const Analysis = mongoose.model('Analysis', analysisSchema);
module.exports = { Analysis, analysisStatuses };
