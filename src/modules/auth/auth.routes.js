const express = require("express");
const {
  registerAgency,
  login,
  logout,
  setupPassword,
  resendSetupLink,
} = require("./auth.controller");

const router = express.Router();

router.post("/register", registerAgency);
router.post("/login", login);
router.post("/logout", logout);
router.post("/setup-password", setupPassword);
router.post("/resend-setup-link", resendSetupLink);

module.exports = router;
