module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/packages/'],
  collectCoverageFrom: [
    'lib/**/*.js',
    'src/**/*.js',
    'formats/format-common.js'
  ],
  // Per-file thresholds set at (or just below) currently-measured coverage so
  // the build fails on regression. Ratchet these upward as coverage improves;
  // never lower them.
  coverageThreshold: {
    './lib/floating-point.js': {
      branches: 99,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './src/url-state.js': {
      branches: 96,
      functions: 100,
      lines: 98,
      statements: 97
    },
    './src/webmcp.js': {
      branches: 94,
      functions: 100,
      lines: 97,
      statements: 97
    },
    './src/ui.js': {
      branches: 77,
      functions: 83,
      lines: 88,
      statements: 87
    },
    './src/theme.js': {
      branches: 97,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './src/mode.js': {
      branches: 97,
      functions: 100,
      lines: 100,
      statements: 100
    },
    './formats/format-common.js': {
      branches: 76,
      functions: 91,
      lines: 95,
      statements: 93
    }
  }
};
