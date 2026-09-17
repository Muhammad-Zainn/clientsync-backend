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

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(requireAuth);
router.use(requireTenant);

router.get("/project/:projectId", getProjectDocuments);
router.post("/upload", upload.single("file"), uploadDocument);
router.get("/", getAllDocuments);
router.delete("/:id", deleteDocument);

module.exports = router;