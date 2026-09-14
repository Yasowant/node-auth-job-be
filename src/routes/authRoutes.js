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
  updateProfile,
} = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, getMe);
router.post("/refresh", refreshAccessToken);
router.post("/forgot-password", forgotPassword);
router.post("/change-password", authMiddleware, changePassword);
router.post("/reset-password/:token", resetPassword);
router.post("/logout-all", authMiddleware, logoutAll);
router.post("/logout", logout);
router.get("/users", authMiddleware, authorizeRoles("ADMIN"), getAllUsers);
router.put("/profile", authMiddleware, updateProfile);

module.exports = router;
