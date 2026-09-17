const express = require("express");
const { registerAgency, login, logout } = require("./auth.controller");

const router = express.Router();

router.post("/register", registerAgency);
router.post("/login", login);
router.post("/logout", logout);

module.exports = router;
