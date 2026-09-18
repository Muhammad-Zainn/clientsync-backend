const express = require("express");
const { otpLimiter } = require("../../shared/middleware/rateLimiter");
const {
  registerAgency,
  login,
  logout,
  setupPassword,
  resendSetupLink,
  verifyOTP,
  resendOTP,
} = require("./auth.controller");

const router = express.Router();

router.post("/register", registerAgency);
router.post("/login", login);
router.post("/logout", logout);
router.post("/setup-password", setupPassword);
router.post("/resend-setup-link", resendSetupLink);

// Apply the strict middleware
router.post("/verify-otp", otpLimiter, verifyOTP);
router.post("/resend-otp", otpLimiter, resendOTP);

module.exports = router;