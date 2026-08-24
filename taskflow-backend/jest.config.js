/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  globals: {
    "ts-jest": {
      isolatedModules: true,
    },
  },
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/setupEnv.js"],
  globalSetup: "<rootDir>/tests/globalSetup.js",
  globalTeardown: "<rootDir>/tests/globalTeardown.js",
  // Integration tests share one Postgres/Redis instance and truncate
  // tables between tests, so they must not run concurrently.
  maxWorkers: 1,
  testTimeout: 20000,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/server.ts",
    "!src/worker.ts",
    "!src/db/migrate.ts",
    "!src/db/seed.ts",
  ],
  coverageDirectory: "coverage",
};
