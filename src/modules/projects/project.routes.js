const express = require("express");
const {
  createProject,
  getProjects,
  getProject,
  updateProject,
  deleteProject,
} = require("./project.controller");
const requireAuth = require("../../shared/middleware/requireAuth");
const requireTenant = require("../../shared/middleware/requireTenant");
const requireRole = require("../../shared/middleware/requireRole");

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

router.post("/", requireRole("agency_admin"), createProject);
router.get("/", getProjects);
router.get("/:id", getProject);
router.patch("/:id", requireRole("agency_admin"), updateProject);
router.delete("/:id", requireRole("agency_admin"), deleteProject);

module.exports = router;
