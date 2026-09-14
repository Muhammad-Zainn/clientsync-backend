const Project = require("./project.model");
const mongoose = require("mongoose");

// @desc    Create a new Project for a client
// @route   POST /api/v1/projects
exports.createProject = async (req, res, next) => {
  try {
    const { clientId, title, status, budget, dueDate, assignedStaff } =
      req.body;

    if (!clientId || !title) {
      return res
        .status(400)
        .json({ error: "Client ID and Title are required." });
    }

    let project = await Project.create({
      tenantId: req.tenantId,
      clientId,
      title,
      status: status || "planning",
      budget: budget || 0,
      dueDate,
      assignedStaff: assignedStaff || [],
    });

    project = await project.populate(
      "clientId",
      "fullName email clientCompanyName",
    );

    const projectData = project.toObject();
    delete projectData.__v;
    delete projectData.tenantId;

    res
      .status(201)
      .json({ message: "Project created successfully!", project: projectData });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all Projects (Filtered by Role)
// @route   GET /api/v1/projects
exports.getProjects = async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = { tenantId: req.tenantId };

    if (status) query.status = status;

    const currentUserId = req.user.id || req.user._id || req.user.userId;
    const userObjectId = new mongoose.Types.ObjectId(currentUserId);

    if (req.user.role === "agency_staff") {
      query.assignedStaff = userObjectId;
    } else if (req.user.role === "client") {
      query.clientId = userObjectId;
    }

    const projects = await Project.find(query)
      .populate("clientId", "fullName email clientCompanyName")
      .select("-__v -tenantId")
      .lean();

    res.status(200).json({ count: projects.length, projects });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single Project by ID
// @route   GET /api/v1/projects/:id
exports.getProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    let query = { _id: id, tenantId: req.tenantId };

    const currentUserId = req.user.id || req.user._id || req.user.userId;
    const userObjectId = new mongoose.Types.ObjectId(currentUserId);

    if (req.user.role === "agency_staff") {
      query.assignedStaff = userObjectId;
    } else if (req.user.role === "client") {
      query.clientId = userObjectId;
    }

    const project = await Project.findOne(query)
      .populate("clientId", "fullName email clientCompanyName")
      .select("-__v -tenantId")
      .lean();

    if (!project) {
      return res
        .status(404)
        .json({ error: "Project not found or you don't have access." });
    }

    res.status(200).json(project);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a Project
// @route   PATCH /api/v1/projects/:id
exports.updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const project = await Project.findOneAndUpdate(
      { _id: id, tenantId: req.tenantId },
      updates,
      {
        returnDocument: "after",
        runValidators: true,
        select: "-__v -tenantId",
      },
    ).lean();

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    res.status(200).json({ message: "Project updated successfully!", project });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a Project
// @route   DELETE /api/v1/projects/:id
exports.deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await Project.findOneAndDelete({
      _id: id,
      tenantId: req.tenantId,
    });
    if (!project) return res.status(404).json({ error: "Project not found." });
    res.status(200).json({ message: "Project deleted successfully!" });
  } catch (error) {
    next(error);
  }
};
