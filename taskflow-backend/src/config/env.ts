import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),

  databaseUrl: required("DATABASE_URL"),

  redis: {
    url: process.env.REDIS_URL || undefined,
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    refreshSecret: required("JWT_REFRESH_SECRET"),
    accessTtl: process.env.JWT_ACCESS_TTL || "15m",
    refreshTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS || "7", 10),
  },

  bcryptCostFactor: Math.max(
    12,
    parseInt(process.env.BCRYPT_COST_FACTOR || "12", 10)
  ),

  authRateLimit: {
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "60000", 10),
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || "10", 10),
  },
};
