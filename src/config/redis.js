const { Redis } = require("@upstash/redis");

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  throw new Error(
    "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required",
  );
}

const redisClient = new Redis({
  url: redisUrl,
  token: redisToken,
});

const connectRedis = async () => {
  try {
    await redisClient.set("redis:health", "ok", { ex: 60 });

    console.log("Redis connected successfully");
  } catch (error) {
    console.error("Redis connection failed:", error.message);
    throw error;
  }
};

const disconnectRedis = async () => {
  // Upstash REST uses HTTP requests.
  // No persistent Redis connection needs to be closed.
  console.log("Redis disconnected");
};

module.exports = {
  redisClient,
  connectRedis,
  disconnectRedis,
};
