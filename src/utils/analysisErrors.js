class AnalysisError extends Error {
  constructor(code) {
    super('Log analysis could not be completed');
    this.name = 'AnalysisError';
    this.code = code;
  }
}

module.exports = { AnalysisError };
