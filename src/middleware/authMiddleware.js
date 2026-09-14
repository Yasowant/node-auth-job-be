const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authenticate = (required) => async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      if (!required) return next();
      return res.status(401).json({
        message: "Access token missing",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    const user = await User.findOne({
      _id: decoded.userId,
      tokenVersion: decoded.tokenVersion,
      isActive: true,
    }).select("_id role tokenVersion");

    if (!user) {
      return res.status(401).json({
        message: "Access token has been revoked",
      });
    }

    // Use the current role from the database rather than a stale JWT claim.
    req.user = {
      userId: user._id.toString(),
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired access token",
    });
  }
};

const authMiddleware = authenticate(true);
const optionalAuthMiddleware = authenticate(false);

module.exports = authMiddleware;
module.exports.optionalAuthMiddleware = optionalAuthMiddleware;
