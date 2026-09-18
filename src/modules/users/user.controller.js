const User = require("./user.model");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Project = require("../projects/project.model");
const { sendInviteSetupEmail } = require("../../shared/utils/sendEmail");
const { generateOpaqueToken } = require("../../shared/utils/crypto");

// @desc    Create a new user (Staff or Client) for the Agency
// @route   POST /api/v1/users
// @access  Private (Requires Auth & Tenant)
exports.createUser = async (req, res, next) => {
  try {
    const { fullName, email, role, clientCompanyName, assignedProjects } =
      req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already in use." });
    }

    const { rawToken, tokenHash } = generateOpaqueToken();
    const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const dummyPassword = crypto.randomBytes(16).toString("hex");
    const salt = await bcrypt.genSalt(10);
    const dummyPasswordHash = await bcrypt.hash(dummyPassword, salt);

    const user = await User.create({
      tenantId: req.tenantId,
      fullName,
      email,
      passwordHash: dummyPasswordHash,
      role: role || "client",
      clientCompanyName,
      requiresPasswordChange: true,
      passwordSetupTokenHash: tokenHash,
      passwordSetupTokenExpiresAt: tokenExpiresAt,
      isVerified: true,
    });

    if (
      user.role === "agency_staff" &&
      Array.isArray(assignedProjects) &&
      assignedProjects.length > 0
    ) {
      await Project.updateMany(
        { _id: { $in: assignedProjects }, tenantId: req.tenantId },
        { $addToSet: { assignedStaff: user._id } },
      );
    }

    // 5. Send the setup email with the raw token
    try {
      await sendInviteSetupEmail(
        req.tenantId,
        email,
        fullName,
        user.role,
        rawToken,
      );
    } catch (emailError) {
      // Failsafe: Rollback the user creation if the email fails to send
      await User.findByIdAndDelete(user._id);
      console.error(
        "Welcome email failed to send, rolling back user:",
        emailError,
      );
      return res.status(500).json({
        error: "Failed to send invitation email. User creation aborted.",
      });
    }

    res.status(201).json({
      message: "User created and setup invitation sent successfully!",
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
    const users = await User.find({ tenantId: req.tenantId })
      .select("-passwordHash -__v -tenantId")
      .lean();

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

    const currentUserId = req.user.id || req.user._id || req.user.userId;

    const user = await User.findById(currentUserId);

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
    const {
      fullName,
      role,
      clientCompanyName,
      isActive,
      clientStatus,
      assignedProjects,
    } = req.body;

    const user = await User.findOneAndUpdate(
      { _id: id, tenantId: req.tenantId },
      { fullName, role, clientCompanyName, isActive, clientStatus },
      { returnDocument: "after", runValidators: true },
    )
      .select("-passwordHash -__v -tenantId")
      .lean();

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (role === "agency_staff" && Array.isArray(assignedProjects)) {
      await Project.updateMany(
        { tenantId: req.tenantId, assignedStaff: id },
        { $pull: { assignedStaff: id } },
      );

      if (assignedProjects.length > 0) {
        await Project.updateMany(
          { _id: { $in: assignedProjects }, tenantId: req.tenantId },
          { $addToSet: { assignedStaff: id } },
        );
      }
    }

    res.status(200).json({
      message: "User updated successfully!",
      user,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Permanently delete a user and their associated projects
// @route   DELETE /api/v1/users/:id
// @access  Private (Agency Admin)
exports.deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findOneAndDelete({
      _id: id,
      tenantId: req.tenantId,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.role === "client") {
      await Project.deleteMany({
        clientId: id,
        tenantId: req.tenantId,
      });
    }

    res
      .status(200)
      .json({ message: "User and associated projects permanently deleted." });
  } catch (error) {
    next(error);
  }
};
