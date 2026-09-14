const Project = require("../projects/project.model");
const User = require("../users/user.model");
const Document = require("../documents/document.model");

// @desc    Get agency analytics, total earnings, completed projects, and client summaries
// @route   GET /api/v1/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;

    const projects = await Project.find({ tenantId })
      .select("-__v -tenantId")
      .lean();

    const ActiveProjects = projects.filter(
      (p) =>
        p.status === "planning" ||
        p.status === "in_progress" ||
        p.status === "client_review",
    );
    const totalPotentialRevenue = ActiveProjects.reduce(
      (sum, p) => sum + (p.budget || 0),
      0,
    );

    const completedProjects = projects.filter((p) => p.status === "completed");
    const totalEarningsFromCompleted = completedProjects.reduce(
      (sum, p) => sum + (p.budget || 0),
      0,
    );

    const statusBreakdown = {
      planning: projects.filter((p) => p.status === "planning").length,
      in_progress: projects.filter((p) => p.status === "in_progress").length,
      client_review: projects.filter((p) => p.status === "client_review")
        .length,
      completed: completedProjects.length,
      total: projects.length,
    };

    const clients = await User.find({ tenantId, role: "client" })
      .select("-passwordHash -__v -tenantId")
      .lean();

    const clientDetails = clients.map((client) => {
      const clientProjects = projects.filter(
        (p) => p.clientId && p.clientId.toString() === client._id.toString(),
      );

      const clientSpend = clientProjects.reduce(
        (sum, p) => sum + (p.budget || 0),
        0,
      );

      const cleanedProjects = clientProjects.map((p) => {
        const { clientId, ...cleanProject } = p;
        return cleanProject;
      });

      return {
        id: client._id,
        fullName: client.fullName,
        email: client.email,
        companyName: client.clientCompanyName || "Independent",
        totalProjects: clientProjects.length,
        totalSpend: clientSpend,
        projects: cleanedProjects,
      };
    });

    res.status(200).json({
      metrics: {
        totalEarningsFromCompleted,
        totalPotentialRevenue,
        statusBreakdown,
      },
      clientDetails,
    });
  } catch (error) {
    next(error);
  }
};
