const express = require("express");
const router = express.Router();

const {
  register,
  login,
  logout,
  getMe,
  refreshAccessToken,
  forgotPassword,
  resetPassword,
  logoutAll,
  changePassword,
  getAllUsers,
  updateUserRole,
  updateProfile,
  uploadAvatar,
  uploadResume,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const {
  loginLimiter,
  passwordResetLimiter,
} = require("../middleware/rateLimitMiddleware");
const {
  avatarUpload,
  resumeUpload,
} = require("../middleware/uploadMiddleware");

router.post("/register", register);
router.post("/login", loginLimiter, login);
router.get("/me", authMiddleware, getMe);
router.post("/refresh", refreshAccessToken);
router.post("/forgot-password", passwordResetLimiter, forgotPassword);
router.post("/change-password", authMiddleware, changePassword);
router.post("/reset-password/:token", passwordResetLimiter, resetPassword);
router.post("/logout-all", authMiddleware, logoutAll);
router.post("/logout", logout);
router.get("/users", authMiddleware, authorizeRoles("ADMIN"), getAllUsers);
router.patch(
  "/users/:id/role",
  authMiddleware,
  authorizeRoles("ADMIN"),
  updateUserRole,
);
router.put("/profile", authMiddleware, updateProfile);
router.post(
  "/profile/avatar",
  authMiddleware,
  avatarUpload,
  uploadAvatar,
);
router.post(
  "/profile/resume",
  authMiddleware,
  resumeUpload,
  uploadResume,
);

module.exports = router;
