const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Tenant = require("../tenants/tenant.model");
const User = require("../../modules/users/user.model");
const { sendVerificationEmail } = require("../../shared/utils/sendEmail");
const crypto = require("crypto");

const getCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  };
};

// @desc    Register a new Agency (Tenant) and their Admin User
// @route   POST /api/v1/auth/register
exports.registerAgency = async (req, res, next) => {
  let tenant = null; // Declare outside try block for cleanup access

  try {
    const { agencyName, subdomain, fullName, email, password } = req.body;

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

    // 1. Create the tenant
    tenant = await Tenant.create({
      name: agencyName,
      subdomain,
      subscriptionPlan: "free_trial",
    });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Generate secure 6-digit OTP and expiration
    const verificationCode = crypto.randomInt(100000, 1000000).toString();
    const verificationCodeExpire = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // 2. Create the user
    const user = await User.create({
      tenantId: tenant._id,
      fullName,
      email,
      passwordHash,
      role: "agency_admin",
      isVerified: false,
      verificationCode,
      verificationCodeExpire,
    });

    try {
      await sendVerificationEmail(email, fullName, verificationCode);
    } catch (emailError) {
      console.error("Verification email failed to send:", emailError);
      // We don't throw here so they can still log in and hit "Resend Email"
    }

    const token = jwt.sign(
      { userId: user._id, tenantId: tenant._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.cookie("token", token, getCookieOptions());

    res.status(201).json({
      message: "Agency registered successfully! Please verify your email.",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        subdomain: tenant.subdomain,
      },
    });
  } catch (error) {
    // -> CLEANUP FIX: Delete the ghost tenant if user creation failed
    if (tenant && tenant._id) {
      await Tenant.findByIdAndDelete(tenant._id);
    }
    next(error);
  }
};

// @desc    Login a user (Admin, Staff, or Client)
// @route   POST /api/v1/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

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

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
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
        mustChangePassword: user.mustChangePassword,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user and clear cookie
// @route   POST /api/v1/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  res.clearCookie("token", getCookieOptions());
  res.status(200).json({ message: "Logged out successfully." });
};

// @desc    Force password reset on first login with temporary credentials
// @route   POST /api/v1/auth/first-time-password-reset
// @access  Private
exports.firstTimePasswordReset = async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        error:
          "Password must be at least 8 characters long, including an uppercase letter, a number, and a special character.",
      });
    }

    const currentUserId = req.user.id || req.user._id || req.user.userId;
    const user = await User.findById(currentUserId);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (!user.mustChangePassword) {
      return res.status(403).json({
        error:
          "Password reset not authorized. This endpoint is only for initial account setup.",
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.mustChangePassword = false;
    await user.save();

    res.status(200).json({
      message: "Password successfully updated. You now have full access.",
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify Agency Admin email using 6-digit code
// @route   POST /api/v1/auth/verify-email
// @access  Private
exports.verifyEmail = async (req, res, next) => {
  try {
    const { code } = req.body;
    const currentUserId = req.user.id || req.user._id || req.user.userId;

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: "Account is already verified." });
    }

    if (
      !code ||
      !user.verificationCode ||
      user.verificationCode !== code ||
      user.verificationCodeExpire < Date.now()
    ) {
      return res
        .status(400)
        .json({ error: "Invalid or expired verification code." });
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpire = undefined;
    await user.save();

    res.status(200).json({
      message: "Email verified successfully. Welcome to ClientSync!",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Resend a new 6-digit verification code
// @route   POST /api/v1/auth/resend-verification
// @access  Private
exports.resendVerificationEmail = async (req, res, next) => {
  try {
    const currentUserId = req.user.id || req.user._id || req.user.userId;

    const user = await User.findById(currentUserId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.isVerified) {
      return res.status(400).json({ error: "Account is already verified." });
    }

    const verificationCode = crypto.randomInt(100000, 1000000).toString();
    const verificationCodeExpire = new Date(Date.now() + 15 * 60 * 1000);

    user.verificationCode = verificationCode;
    user.verificationCodeExpire = verificationCodeExpire;
    await user.save();

    try {
      await sendVerificationEmail(user.email, user.fullName, verificationCode);
    } catch (emailError) {
      console.error("Verification email failed to send:", emailError);
      return res
        .status(500)
        .json({ error: "Failed to send email. Please try again." });
    }

    res.status(200).json({
      message: "A new verification code has been sent to your email.",
    });
  } catch (error) {
    next(error);
  }
};
