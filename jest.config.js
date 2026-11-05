module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/', '/tests/integration/'],
  collectCoverageFrom: ['src/**/*.js'],
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 90, branches: 90, functions: 85, lines: 93 },
    './src/utils/analysisRequest.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/services/analysisSubmissionService.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
    './src/middlewares/analysisDeadline.js': { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
