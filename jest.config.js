module.exports = {
  testEnvironment: "node",
  setupFilesAfterEnv: [require.resolve("./tests/setup.js")],
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  collectCoverageFrom: [
    "src/**/*.js",
    "!src/config/db.js",
  ],
  coverageReporters: ["text", "lcov"],
  testTimeout: 30000,
  forceExit: true,
};
