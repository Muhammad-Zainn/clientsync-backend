const express = require("express");
const {
  createTask,
  getProjectTasks,
  updateTask,
  deleteTask,
} = require("./task.controller");
const requireAuth = require("../../shared/middleware/requireAuth");
const requireTenant = require("../../shared/middleware/requireTenant");
const requireRole = require("../../shared/middleware/requireRole");

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

router.post("/", requireRole("agency_admin"), createTask);
router.get("/project/:projectId", getProjectTasks);
router.patch("/:id", requireRole("agency_admin", "agency_staff"), updateTask);
router.delete("/:id", requireRole("agency_admin"), deleteTask);

module.exports = router;
