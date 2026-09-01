const express = require("express");
const {
  createTask,
  getProjectTasks,
  updateTask,
  deleteTask,
} = require("./task.controller");
const requireAuth = require("../../shared/middleware/requireAuth");
const requireTenant = require("../../shared/middleware/requireTenant");

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

router.post("/", createTask);
router.get("/project/:projectId", getProjectTasks);
router.patch("/:id", updateTask);
router.delete("/:id", deleteTask);

module.exports = router;
