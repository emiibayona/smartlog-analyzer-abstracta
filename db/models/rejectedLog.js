const mongoose = require('mongoose');

const rejectedLogSchema = new mongoose.Schema({
  receivedAt: { type: Date, required: true },
  requestId: { type: String, required: true },
  submissionJson: { type: String, required: true },
  reason: { type: String, enum: ['validation', 'primary_write'], required: true },
  issues: [{ type: String }],
  primaryLogId: { type: mongoose.Schema.Types.ObjectId },
}, { collection: 'rejected_logs' });
rejectedLogSchema.index({ receivedAt: -1, _id: -1 });
rejectedLogSchema.index({ requestId: 1 });

module.exports = mongoose.model('RejectedLog', rejectedLogSchema);
