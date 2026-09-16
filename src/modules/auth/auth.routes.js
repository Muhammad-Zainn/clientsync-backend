const express = require("express");
const {
  registerAgency,
  login,
  logout,
  firstTimePasswordReset,
  verifyEmail,
  resendVerificationEmail,
} = require("./auth.controller");

const requireAuth = require("../../shared/middleware/requireAuth"); 

const router = express.Router();

router.post("/register", registerAgency);
router.post("/login", login);
router.post("/logout", logout);
router.post("/first-time-password-reset", requireAuth, firstTimePasswordReset);
router.post("/verify-email", requireAuth, verifyEmail);
router.post("/resend-verification", requireAuth, resendVerificationEmail);

module.exports = router;