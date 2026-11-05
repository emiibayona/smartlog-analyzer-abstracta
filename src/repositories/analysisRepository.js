const { Analysis } = require('../../db/models/analysis');
const { AnalysisError } = require('../utils/analysisErrors');

function createAnalysisRepository(timeoutMs = 5000) {
  const options = { timeoutMS: timeoutMs, writeConcern: { w: 1 } };
  return {
    async create(values) {
      try {
        const document = new Analysis(values);
        await document.validate();
        const result = await Analysis.collection.insertOne(document.toObject(), options);
        if (!result.acknowledged) throw new Error('Unacknowledged write');
        return document._id.toString();
      } catch { throw new AnalysisError('PERSISTENCE_FAILED'); }
    },
    async update(id, values, clearResult = false) {
      try {
        const update = { $set: values };
        if (clearResult) update.$unset = { result: '', message: '', report: '' };
        const result = await Analysis.collection.updateOne({ _id: Analysis.schema.path('_id').cast(id) }, update, options);
        if (!result.acknowledged || result.matchedCount !== 1) throw new Error('Unconfirmed update');
      } catch { throw new AnalysisError('PERSISTENCE_FAILED'); }
    },
  };
}

module.exports = { createAnalysisRepository };
