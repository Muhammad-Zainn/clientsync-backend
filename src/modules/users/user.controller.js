const User = require("./user.model");
const bcrypt = require("bcryptjs");

// @desc    Create a new user (Staff or Client) for the Agency
// @route   POST /api/v1/users
// @access  Private (Requires Auth & Tenant)
exports.createUser = async (req, res, next) => {
  try {
    const { fullName, email, password, role, clientCompanyName } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      tenantId: req.tenantId,
      fullName,
      email,
      passwordHash,
      role: role || "client",
      clientCompanyName,
    });

    res.status(201).json({
      message: "User created successfully!",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        company: user.clientCompanyName,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all users belonging to the current Agency
// @route   GET /api/v1/users
// @access  Private
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find({ tenantId: req.tenantId }).select(
      "-passwordHash",
    );

    res.status(200).json({
      count: users.length,
      users,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Change password for the logged-in user
// @route   PATCH /api/v1/users/change-password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // req.userId should be set by your requireAuth middleware
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect current password." });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({ message: "Password updated successfully!" });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user details
// @route   PATCH /api/v1/users/:id
// @access  Private (Agency Admin)
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, role, clientCompanyName, isActive, clientStatus } =
      req.body;

    const user = await User.findOneAndUpdate(
      { _id: id, tenantId: req.tenantId },
      { fullName, role, clientCompanyName, isActive, clientStatus },
      { new: true, runValidators: true },
    ).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({ message: "User updated successfully!", user });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a user
// @route   DELETE /api/v1/users/:id
// @access  Private (Agency Admin)
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    // findOneAndDelete ensures they can only delete users in their specific agency
    const user = await User.findOneAndDelete({
      _id: id,
      tenantId: req.tenantId,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({ message: "User deleted successfully!" });
  } catch (error) {
    next(error);
  }
};
