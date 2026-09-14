const express = require("express");
const {
  createProject,
  getProjects,
  getProject, // <-- Imported the new function
  updateProject,
  deleteProject,
} = require("./project.controller");
const requireAuth = require("../../shared/middleware/requireAuth");
const requireTenant = require("../../shared/middleware/requireTenant");

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

router.post("/", createProject);
router.get("/", getProjects);
router.get("/:id", getProject);
router.patch("/:id", updateProject);
router.delete("/:id", deleteProject);

module.exports = router;
