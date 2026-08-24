const { Client } = require("pg");
const { execSync } = require("child_process");
require("dotenv/config");

const TEST_DB_NAME = "taskflow_test";
const ADMIN_URL =
  process.env.TEST_DATABASE_ADMIN_URL ||
  "postgresql://postgres:postgres@localhost:5432/postgres";
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  `postgresql://postgres:postgres@localhost:5432/${TEST_DB_NAME}?schema=public`;

module.exports = async function globalSetup() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } catch (err) {
    // 42P04 = duplicate_database - fine, it already exists from a prior run.
    if (err.code !== "42P04") {
      await client.end();
      throw err;
    }
  }
  await client.end();

  execSync("npx ts-node src/db/migrate.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
};
