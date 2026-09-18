const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Tenant = require("../tenants/tenant.model");
const User = require("../../modules/users/user.model");
const {
  hashToken,
  generateOpaqueToken,
  generateOTP,
} = require("../../shared/utils/crypto");
const {
  sendInviteSetupEmail,
  sendVerificationEmail,
} = require("../../shared/utils/sendEmail");

const getCookieOptions = (isLogout = false) => {
  const isProduction = process.env.NODE_ENV === "production";
  const options = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  };

  if (!isLogout) {
    options.maxAge = 24 * 60 * 60 * 1000;
  }

  return options;
};

// @desc    Register a new Agency (Tenant) and their Admin User
// @route   POST /api/v1/auth/register
exports.registerAgency = async (req, res, next) => {
  try {
    const { agencyName, subdomain, fullName, email, password } = req.body;

    if (typeof email !== "string") {
      return res.status(400).json({ error: "Invalid email format." });
    }

    const existingTenant = await Tenant.findOne({ subdomain });
    if (existingTenant) {
      return res
        .status(400)
        .json({ error: "Subdomain already taken. Please choose another." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use." });
    }

    const tenant = await Tenant.create({
      name: agencyName,
      subdomain,
      subscriptionPlan: "free_trial",
    });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const otp = generateOTP();
    const verificationTokenHash = hashToken(otp);
    const verificationTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    const user = await User.create({
      tenantId: tenant._id,
      fullName,
      email,
      passwordHash,
      role: "agency_admin",
      verificationTokenHash,
      verificationTokenExpiresAt,
    });

    // Rollback account creation if email delivery fails
    try {
      await sendVerificationEmail(user.email, user.fullName, otp);
    } catch (emailError) {
      await User.findByIdAndDelete(user._id);
      await Tenant.findByIdAndDelete(tenant._id);
      return res
        .status(500)
        .json({
          error: "Email delivery failed. Please try registering again.",
        });
    }

    res.status(201).json({
      message: "Registration successful. Please check your email for the OTP.",
      requiresVerification: true,
      email: user.email,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login a user (Admin, Staff, or Client)
// @route   POST /api/v1/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Invalid credentials format." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    if (!user.isActive) {
      return res.status(403).json({
        error:
          "This account has been deactivated. Please contact your agency admin.",
      });
    }

    if (user.requiresPasswordChange) {
      return res.status(403).json({
        error:
          "Account setup incomplete. Please check your email for the setup link.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // OTP VERIFICATION GUARD
    if (!user.isVerified) {
      const otp = generateOTP();

      // Attempt to send email before mutating database state
      try {
        await sendVerificationEmail(user.email, user.fullName, otp);
      } catch (emailError) {
        return res
          .status(500)
          .json({
            error: "Failed to dispatch verification email. Please try again.",
          });
      }

      user.verificationTokenHash = hashToken(otp);
      user.verificationTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      return res.status(403).json({
        error: "Please verify your email address.",
        requiresVerification: true,
        email: user.email,
      });
    }

    const token = jwt.sign(
      { userId: user._id, tenantId: user.tenantId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.cookie("token", token, getCookieOptions());

    res.status(200).json({
      message: "Login successful!",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user and clear cookie
// @route   POST /api/v1/auth/logout
exports.logout = async (req, res) => {
  res.clearCookie("token", getCookieOptions(true));
  res.status(200).json({ message: "Logged out successfully." });
};

// @desc    Complete the passwordless invite flow by setting a password
// @route   POST /api/v1/auth/setup-password
// @access  Public
exports.setupPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (typeof token !== "string" || typeof newPassword !== "string") {
      return res
        .status(400)
        .json({ error: "Token and new password are required." });
    }

    const hashedToken = hashToken(token);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    const user = await User.findOneAndUpdate(
      {
        passwordSetupTokenHash: hashedToken,
        passwordSetupTokenExpiresAt: { $gt: Date.now() },
        isActive: true,
      },
      {
        $set: { passwordHash, requiresPasswordChange: false },
        $unset: { passwordSetupTokenHash: 1, passwordSetupTokenExpiresAt: 1 },
      },
      { new: true },
    );

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired setup token." });
    }

    const jwtToken = jwt.sign(
      {
        userId: user._id,
        tenantId: user.tenantId,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    res.cookie("token", jwtToken, getCookieOptions());

    res.status(200).json({
      message: "Password set successfully. You are now logged in.",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend the password setup link using an expired token
// @route   POST /api/v1/auth/resend-setup-link
// @access  Public
exports.resendSetupLink = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (typeof token !== "string") {
      return res.status(400).json({ error: "Original token is required." });
    }

    const hashedToken = hashToken(token);

    const user = await User.findOne({
      passwordSetupTokenHash: hashedToken,
      isActive: true,
      requiresPasswordChange: true,
    });

    if (!user) {
      return res.status(400).json({
        error:
          "Cannot send setup link. This link is invalid or the account is already set up.",
      });
    }

    const { rawToken, tokenHash } = generateOpaqueToken();
    const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // Send email first, ensuring the original token remains intact if it fails
    try {
      await sendInviteSetupEmail(
        user.tenantId,
        user.email,
        user.fullName,
        user.role,
        rawToken,
      );
    } catch (emailError) {
      return res
        .status(500)
        .json({ error: "Failed to dispatch setup link. Please try again." });
    }

    user.passwordSetupTokenHash = tokenHash;
    user.passwordSetupTokenExpiresAt = tokenExpiresAt;
    await user.save();

    res.status(200).json({
      message: "A new setup link has been sent to your email.",
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify account via 6-digit OTP
// @route   POST /api/v1/auth/verify-otp
// @access  Public
exports.verifyOTP = async (req, res, next) => {
  try {
    const { email, otp } = req.body;

    // Strict validation to prevent NoSQL operator injection and crypto crashes
    if (
      typeof email !== "string" ||
      typeof otp !== "string" ||
      !/^\d{6}$/.test(otp)
    ) {
      return res
        .status(400)
        .json({ error: "A valid email and 6-digit OTP are required." });
    }

    const hashedOTP = hashToken(otp);

    const user = await User.findOneAndUpdate(
      {
        email,
        verificationTokenHash: hashedOTP,
        verificationTokenExpiresAt: { $gt: Date.now() },
      },
      {
        $set: { isVerified: true },
        $unset: { verificationTokenHash: 1, verificationTokenExpiresAt: 1 },
      },
      { new: true },
    );

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired OTP." });
    }

    const token = jwt.sign(
      { userId: user._id, tenantId: user.tenantId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.cookie("token", token, getCookieOptions());

    res.status(200).json({
      message: "Email verified successfully.",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend the 6-digit OTP manually
// @route   POST /api/v1/auth/resend-otp
// @access  Public
exports.resendOTP = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (typeof email !== "string") {
      return res.status(400).json({ error: "Valid email is required." });
    }

    const user = await User.findOne({ email, isVerified: false });

    if (!user) {
      return res
        .status(400)
        .json({ error: "Account is already verified or does not exist." });
    }

    const otp = generateOTP();

    // Ensure email delivery succeeds before rotating the database token
    try {
      await sendVerificationEmail(user.email, user.fullName, otp);
    } catch (emailError) {
      return res
        .status(500)
        .json({ error: "Failed to send new OTP email. Please try again." });
    }

    user.verificationTokenHash = hashToken(otp);
    user.verificationTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    res.status(200).json({ message: "A new OTP has been sent to your email." });
  } catch (error) {
    next(error);
  }
};
