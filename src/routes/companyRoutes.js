const express = require("express");
const router = express.Router();

const {
  createCompany,
  getMyCompany,
  getCompanyById,
  getAllCompany,
  updateCompany,
  verifyCompany,
  deleteCompany,
} = require("../controllers/companyController");
const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

router.post("/", authMiddleware, authorizeRoles("RECRUITER"), createCompany);
router.get(
  "/my/company",
  authMiddleware,
  authorizeRoles("RECRUITER"),
  getMyCompany,
);

router.get("/:id", getCompanyById);
router.get("/", getAllCompany);

router.put("/:id", authMiddleware, authorizeRoles("RECRUITER"), updateCompany);
router.patch(
  "/:id/verify",
  authMiddleware,
  authorizeRoles("ADMIN"),
  verifyCompany,
);

router.delete(
  "/:id",
  authMiddleware,
  authorizeRoles("RECRUITER"),
  deleteCompany,
);

module.exports = router;
