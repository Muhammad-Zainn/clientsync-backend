const express = require("express");
const {
  createUser,
  getUsers,
  changePassword,
  updateUser,
  deleteUser,
} = require("./user.controller");
const requireAuth = require("../../shared/middleware/requireAuth");
const requireTenant = require("../../shared/middleware/requireTenant");
const requireRole = require("../../shared/middleware/requireRole");

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

router.post("/", requireRole("agency_admin"), createUser);
router.get("/", getUsers);
router.patch("/changepassword", changePassword);
router.patch("/:id", requireRole("agency_admin"), updateUser);
router.delete("/:id", requireRole("agency_admin"), deleteUser);

module.exports = router;
