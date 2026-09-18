const rateLimit = require("express-rate-limit");

// Strict limiter for sensitive authentication routes
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 attempts per window
  message: { error: "Too many verification attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Global API limiter (Moved from app.js for centralization)
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, 
  message: { error: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  otpLimiter,
  globalApiLimiter,
};