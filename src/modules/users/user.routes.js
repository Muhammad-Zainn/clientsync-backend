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

const router = express.Router();

router.use(requireAuth);
router.use(requireTenant);

router.post("/", createUser);
router.get("/", getUsers);
router.patch("/changepassword", changePassword);
router.patch("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
