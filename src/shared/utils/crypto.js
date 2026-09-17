const crypto = require("crypto");

//  Generates a cryptographically secure random token and its SHA-256 hash.
//  - rawToken: Sent to the user via email (never stored in DB).
//  - tokenHash: Stored in the DB to verify the raw token later.
const generateOpaqueToken = () => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  return { rawToken, tokenHash };
};

// Hashes an incoming token (or OTP) to compare against the database
const hashToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

module.exports = {
  generateOpaqueToken,
  hashToken,
};
