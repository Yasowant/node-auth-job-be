const jwt = require("jsonwebtoken");

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    },
    process.env.JWT_ACCESS_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN,
    },
  );
};

const generateRefereshToken = (userId) => {
  return jwt.sign(
    {
      userId,
    },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN,
    },
  );
};

/**
 * Drop refresh tokens that no longer verify (expired, or signed with a retired
 * secret). Without this the array grows by one on every login, forever.
 */
const pruneRefreshTokens = (tokens = []) =>
  tokens.filter((token) => {
    try {
      jwt.verify(token, process.env.JWT_REFRESH_SECRET);
      return true;
    } catch {
      return false;
    }
  });

/** Most concurrent sessions we keep per user. */
const MAX_REFRESH_TOKENS = 10;

module.exports = {
  generateAccessToken,
  generateRefereshToken,
  pruneRefreshTokens,
  MAX_REFRESH_TOKENS,
};
