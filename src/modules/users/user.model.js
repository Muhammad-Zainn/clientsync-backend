const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["agency_admin", "agency_staff", "client"],
      required: true,
    },
    clientCompanyName: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    clientStatus: {
      type: String,
      enum: ["active", "previous", "lead"],
      default: "active",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    requiresPasswordChange: {
      type: Boolean,
      default: false,
    },
    verificationTokenHash: {
      type: String,
    },
    verificationTokenExpiresAt: {
      type: Date,
    },
    passwordSetupTokenHash: {
      type: String,
    },
    passwordSetupTokenExpiresAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
