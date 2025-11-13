module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: ['lib/**/*.js'],
  // Pure math module has near-complete coverage
  coverageThreshold: {
    global: {
      branches: 84,
      functions: 100,
      lines: 100,
      statements: 100
    }
  }
};
