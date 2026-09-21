const { redisClient } = require("../config/redis");

const USERS_CACHE_VERSION_KEY = "users:cache:version";

const getUsersCacheVersion = async () => {
  const version = await redisClient.get(USERS_CACHE_VERSION_KEY);

  return Number(version) || 1;
};

const invalidateUsersCache = async () => {
  const version = await redisClient.incr(USERS_CACHE_VERSION_KEY);

  console.log(`Users cache invalidated. New version: ${version}`);

  return version;
};

module.exports = {
  getUsersCacheVersion,
  invalidateUsersCache,
};
