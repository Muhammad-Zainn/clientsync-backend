const express = require("express");
const multer = require("multer"); 
const {
  getProjectDocuments,
  uploadDocument, 
  getAllDocuments,
  deleteDocument, 
} = require("./document.controller");
const requireAuth = require("../../shared/middleware/requireAuth");
const requireTenant = require("../../shared/middleware/requireTenant");
const requireRole = require("../../shared/middleware/requireRole");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(requireAuth);
router.use(requireTenant);

router.get("/project/:projectId", getProjectDocuments);
router.post("/upload", upload.single("file"), requireRole("agency_admin"), uploadDocument);
router.get("/", requireRole("agency_admin"), getAllDocuments);
router.delete("/:id", requireRole("agency_admin"), deleteDocument);

module.exports = router;