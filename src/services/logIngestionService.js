const mongoose = require('mongoose');
const Log = require('../../db/models/log');
const RejectedLog = require('../../db/models/rejectedLog');
const { validateLogBody } = require('../utils/logBody');
const { log, errorDetails } = require('../utils/logger');

// Acknowledge only confirmed writes; quarantine readable invalid or failed submissions.
async function ingestLog({ body, submissionJson, requestId }, timeoutMs = 5000) {
  const validation = validateLogBody(body);
  let reason = 'validation';
  let issues = validation.issues;
  let primaryLogId;
  const options = { timeoutMS: timeoutMs, writeConcern: { w: 1 } };
  if (!issues.length) {
    primaryLogId = new mongoose.Types.ObjectId();
    try {
      const document = new Log({ ...validation.value, _id: primaryLogId });
      await document.validate();
      const result = await Log.collection.insertOne(document.toObject(), options);
      if (!result.acknowledged) throw new Error('Unacknowledged primary write');
      return { status: 201, body: { ...validation.value, id: primaryLogId.toString() } };
    } catch (error) {
      reason = 'primary_write';
      issues = ['Primary storage did not confirm insertion'];
      log('error', 'log_primary_write_failed', { requestId, primaryLogId: primaryLogId.toString(), error: errorDetails(error) });
    }
  }
  try {
    const rejected = new RejectedLog({ receivedAt: new Date(), requestId, submissionJson, reason, issues, primaryLogId });
    await rejected.validate();
    const result = await RejectedLog.collection.insertOne(rejected.toObject(), options);
    if (!result.acknowledged) throw new Error('Unacknowledged fallback write');
    return { status: 202, body: { status: 'quarantined', id: rejected._id.toString(), requestId, reason, issues } };
  } catch (error) {
    log('error', 'log_fallback_write_failed', { requestId, error: errorDetails(error) });
    throw Object.assign(new Error('Log storage unavailable; retry the submission'), { status: 503 });
  }
}

module.exports = { ingestLog };
