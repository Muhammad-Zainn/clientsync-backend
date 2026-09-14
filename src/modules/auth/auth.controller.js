const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Tenant = require("../tenants/tenant.model");
const User = require("../../modules/users/user.model");

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
      { userId: user._id, tenantId: tenant._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.cookie("token", token, getCookieOptions());

    res.status(201).json({
      message: "Agency registered successfully!",
      token,
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
      token,
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
  res.clearCookie("token", getCookieOptions());
  res.status(200).json({ message: "Logged out successfully." });
};
