const multer = require("multer");

// Files never touch disk - they go straight to Cloudinary as a Buffer, so
// there's nothing on this server's filesystem to clean up afterwards.
const storage = multer.memoryStorage();

const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const RESUME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const avatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!IMAGE_TYPES.has(file.mimetype)) {
      return cb(new Error("Avatar must be a JPEG, PNG or WebP image"));
    }

    return cb(null, true);
  },
}).single("avatar");

const resumeUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (!RESUME_TYPES.has(file.mimetype)) {
      return cb(new Error("Resume must be a PDF or Word document"));
    }

    return cb(null, true);
  },
}).single("resume");

// multer reports its own errors (bad file type, too large, missing file
// field) by calling back with an error rather than throwing, so without this
// wrapper they'd bubble up as an unhandled exception instead of a clean 400.
const handleUpload = (uploader) => (req, res, next) => {
  uploader(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "File is too large"
          : error.message;

      return res.status(400).json({ message });
    }

    if (error) {
      return res.status(400).json({ message: error.message || "Upload failed" });
    }

    return next();
  });
};

module.exports = {
  avatarUpload: handleUpload(avatarUpload),
  resumeUpload: handleUpload(resumeUpload),
};
