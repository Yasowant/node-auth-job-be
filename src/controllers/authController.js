const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const User = require("../models/User");

const {
  generateAccessToken,
  generateRefereshToken,
} = require("../utils/token");

// ======================================================
// COOKIE OPTIONS
// ======================================================

const isProduction = process.env.NODE_ENV === "production";

const accessCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: 15 * 60 * 1000,
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// ======================================================
// REGISTER
// ======================================================

const register = async (req, res, next) => {
  try {
    const { name, email, password, workStatus } = req.body;

    // Validation
    if (!name || !email || !password || !workStatus) {
      return res.status(400).json({
        message: "Name, email, password and workStatus are required",
      });
    }

    // Check existing user
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "USER",
      workStatus,
    });

    return res.status(201).json({
      message: "User registered successfully",

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        workStatus: user.workStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// LOGIN
// ======================================================

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    // Find user
    const user = await User.findOne({
      email,
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Compare password
    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);

    const refreshToken = generateRefereshToken(user._id);

    // Store refresh token
    user.refreshTokens.push(refreshToken);

    await user.save();

    // Access token cookie
    res.cookie("accessToken", accessToken, accessCookieOptions);

    // Refresh token cookie
    res.cookie("refreshToken", refreshToken, refreshCookieOptions);

    return res.status(200).json({
      message: "Login successful",

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        workStatus: user.workStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET ME
// ======================================================

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "-password -refreshTokens",
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      user,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// GET PROFILE
// ======================================================

const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "-password -refreshTokens",
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "Profile fetched successfully",

      user,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// REFRESH ACCESS TOKEN
// ======================================================

const refreshAccessToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token missing",
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Find user
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        message: "User not found",
      });
    }

    // Check refresh token exists
    const tokenExists = user.refreshTokens.includes(refreshToken);

    if (!tokenExists) {
      return res.status(401).json({
        message: "Invalid refresh token",
      });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(user);

    // Replace access cookie
    res.cookie("accessToken", newAccessToken, accessCookieOptions);

    return res.status(200).json({
      message: "Access token refreshed",
    });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired refresh token",
    });
  }
};

// ======================================================
// FORGOT PASSWORD
// ======================================================

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const user = await User.findOne({ email });

    // Don't reveal whether email exists
    if (!user) {
      return res.status(200).json({
        message: "If that email exists, a reset link will be sent",
      });
    }

    // Generate random token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Hash token before storing
    const hashedResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedResetToken;

    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    // Development only
    console.log("Reset token:", resetToken);

    return res.status(200).json({
      message: "Password reset instructions generated",
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// RESET PASSWORD
// ======================================================

const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;

    const { password } = req.body;

    if (!token) {
      return res.status(400).json({
        message: "Reset token is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        message: "Password is required",
      });
    }

    // Hash received token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find valid user
    const user = await User.findOne({
      resetPasswordToken: hashedToken,

      resetPasswordExpires: {
        $gt: new Date(),
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired reset token",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    user.password = hashedPassword;

    // Remove reset token
    user.resetPasswordToken = null;

    user.resetPasswordExpires = null;

    // Invalidate all sessions
    user.refreshTokens = [];

    await user.save();

    // Clear cookies
    res.clearCookie("accessToken", accessCookieOptions);

    res.clearCookie("refreshToken", refreshCookieOptions);

    return res.status(200).json({
      message: "Password reset successfully. Please login again.",
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// LOGOUT
// ======================================================

const logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    // Remove current refresh token
    if (refreshToken) {
      await User.updateOne(
        {
          refreshTokens: refreshToken,
        },

        {
          $pull: {
            refreshTokens: refreshToken,
          },
        },
      );
    }

    // Clear cookies
    res.clearCookie("accessToken", accessCookieOptions);

    res.clearCookie("refreshToken", refreshCookieOptions);

    return res.status(200).json({
      message: "Logout successful",
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// LOGOUT ALL DEVICES
// ======================================================

const logoutAll = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Remove all refresh tokens
    user.refreshTokens = [];

    await user.save();

    // Clear current browser cookies
    res.clearCookie("accessToken", accessCookieOptions);

    res.clearCookie("refreshToken", refreshCookieOptions);

    return res.status(200).json({
      message: "Logged out from all devices",
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// CHANGE PASSWORD
// ======================================================

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current and new password are required",
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Check current password
    const isPasswordCorrect = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordCorrect) {
      return res.status(401).json({
        message: "Current password is incorrect",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    user.password = hashedPassword;

    // Invalidate all sessions
    user.refreshTokens = [];

    await user.save();

    // Clear current cookies
    res.clearCookie("accessToken", accessCookieOptions);

    res.clearCookie("refreshToken", refreshCookieOptions);

    return res.status(200).json({
      message: "Password changed successfully. Please login again.",
    });
  } catch (error) {
    next(error);
  }
};

const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find()
      .select(
        "-password -refreshTokens -resetPasswordToken -resetPasswordExpires",
      )
      .sort({ createdAt: -1 });
    return res.status(200).json({
      message: "Users fetched successfully",
      count: users.length,
      users,
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// UPDATE PROFILE
// ======================================================

const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const {
      name,
      email,
      workStatus,
      avatar,
      phone,
      location,
      headline,
      bio,
      skills,
      totalExperience,
      experience,
      education,
      preferredJobTitle,
      preferredLocation,
      expectedSalary,
      noticePeriod,
    } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Update basic profile fields
    if (name !== undefined) user.name = name;
    if (avatar !== undefined) user.avatar = avatar;
    if (phone !== undefined) user.phone = phone;
    if (location !== undefined) user.location = location;
    if (headline !== undefined) user.headline = headline;
    if (bio !== undefined) user.bio = bio;

    // Work status
    if (workStatus !== undefined) {
      user.workStatus = workStatus;
    }

    // Email
    if (email !== undefined && email !== user.email) {
      const existingUser = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: userId },
      });

      if (existingUser) {
        return res.status(409).json({
          message: "Email already in use",
        });
      }

      user.email = email.toLowerCase();
    }

    // Skills
    if (skills !== undefined) {
      user.skills = skills;
    }

    // Total experience
    if (totalExperience !== undefined) {
      user.totalExperience = totalExperience;
    }

    // Work experience
    if (experience !== undefined) {
      user.experience = experience;
    }

    // Education
    if (education !== undefined) {
      user.education = education;
    }

    // Job preferences
    if (preferredJobTitle !== undefined) {
      user.preferredJobTitle = preferredJobTitle;
    }

    if (preferredLocation !== undefined) {
      user.preferredLocation = preferredLocation;
    }

    if (expectedSalary !== undefined) {
      user.expectedSalary = expectedSalary;
    }

    if (noticePeriod !== undefined) {
      user.noticePeriod = noticePeriod;
    }

    await user.save();

    return res.status(200).json({
      message: "Profile updated successfully",

      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        workStatus: user.workStatus,
        avatar: user.avatar,
        phone: user.phone,
        location: user.location,
        headline: user.headline,
        bio: user.bio,
        skills: user.skills,
        totalExperience: user.totalExperience,
        experience: user.experience,
        education: user.education,
        resume: user.resume,
        preferredJobTitle: user.preferredJobTitle,
        preferredLocation: user.preferredLocation,
        expectedSalary: user.expectedSalary,
        noticePeriod: user.noticePeriod,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ======================================================
// EXPORT
// ======================================================

module.exports = {
  register,
  login,
  getMe,
  getProfile,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
  logout,
  logoutAll,
  changePassword,
  getAllUsers,
  updateProfile,
};
