process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/taskflow_test?schema=public";
process.env.REDIS_HOST = process.env.REDIS_HOST || "localhost";
process.env.REDIS_PORT = process.env.REDIS_PORT || "6379";
process.env.JWT_ACCESS_SECRET = "test_access_secret_do_not_use_in_prod";
process.env.JWT_REFRESH_SECRET = "test_refresh_secret_do_not_use_in_prod";
process.env.JWT_ACCESS_TTL = "15m";
process.env.JWT_REFRESH_TTL_DAYS = "7";
process.env.BCRYPT_COST_FACTOR = "4"; // fast hashing in tests, still exercises real bcrypt
// Rate limiting is a Task 02 feature we test in isolation (see
// auth.test.ts); everywhere else, a high ceiling keeps other test suites
// from tripping it as a side effect of making many requests.
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.AUTH_RATE_LIMIT_WINDOW_MS = "60000";
