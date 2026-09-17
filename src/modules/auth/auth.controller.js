const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Tenant = require("../tenants/tenant.model");
const User = require("../../modules/users/user.model");
const { hashToken, generateOpaqueToken } = require("../../shared/utils/crypto");
const { sendInviteSetupEmail } = require("../../shared/utils/sendEmail");

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

    const user = await User.create({
      tenantId: tenant._id,
      fullName,
      email,
      passwordHash,
      role: "agency_admin",
    });

    const token = jwt.sign(
      {
        userId: user._id,
        tenantId: tenant._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1d",
      },
    );

    res.cookie("token", token, getCookieOptions());

    res.status(201).json({
      message: "Agency registered successfully!",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        subdomain: tenant.subdomain,
      },
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
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const token = jwt.sign(
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

    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ error: "Token and new password are required." });
    }

    const hashedToken = hashToken(token);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // CRITICAL FIX: Atomic findOneAndUpdate prevents concurrent request race conditions
    // and enforces isActive: true
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
      { new: true }, // Returns the document AFTER the updates are applied
    );

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired setup token." });
    }

    // Replicate your exact login JWT logic
    const jwtToken = jwt.sign(
      { userId: user._id, tenantId: user.tenantId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    // Replicate your exact cookie logic
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

    if (!token) {
      return res.status(400).json({ error: "Original token is required." });
    }

    const hashedToken = hashToken(token);

    // Find the user by their OLD token, even if it is expired.
    // We still enforce isActive and requiresPasswordChange for security.
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

    // 1. Generate a brand new token and 30-minute expiry
    const { rawToken, tokenHash } = generateOpaqueToken();
    const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    // 2. Update the user record with the new token
    user.passwordSetupTokenHash = tokenHash;
    user.passwordSetupTokenExpiresAt = tokenExpiresAt;
    await user.save();

    // 3. Send the fresh email
    await sendInviteSetupEmail(
      user.tenantId,
      user.email,
      user.fullName,
      user.role,
      rawToken,
    );

    res.status(200).json({
      message: "A new setup link has been sent to your email.",
    });
  } catch (error) {
    next(error);
  }
};
