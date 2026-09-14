const express = require("express");
const { registerAgency, login, logout } = require("./auth.controller"); // <-- Add logout here

const router = express.Router();

router.post("/register", registerAgency);
router.post("/login", login);
router.post("/logout", logout); // <-- Add this route

module.exports = router;
