const Project = require("./project.model");

// @desc    Create a new Project for a client
// @route   POST /api/v1/projects
// @access  Private
exports.createProject = async (req, res, next) => {
  try {
    const { clientId, title, status, budget, dueDate } = req.body;

    if (!clientId || !title) {
      return res
        .status(400)
        .json({ error: "Client ID and Title are required." });
    }

    const project = await Project.create({
      tenantId: req.tenantId,
      clientId,
      title,
      status: status || "planning",
      budget: budget || 0,
      dueDate,
    });

    res.status(201).json({
      message: "Project created successfully!",
      project,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all Projects for the current Agency (with optional status filter)
// @route   GET /api/v1/projects?status=completed
// @access  Private
exports.getProjects = async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = { tenantId: req.tenantId };

    if (status) {
      query.status = status;
    }

    const projects = await Project.find(query).populate(
      "clientId",
      "fullName email clientCompanyName",
    );

    res.status(200).json({
      count: projects.length,
      projects,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single Project by ID
// @route   GET /api/v1/projects/:id
// @access  Private
exports.getProject = async (req, res, next) => {
  try {
    const { id } = req.params;

    // findOne ensures we also check the tenantId so clients can't spy on other agencies
    const project = await Project.findOne({
      _id: id,
      tenantId: req.tenantId,
    }).populate("clientId", "fullName email clientCompanyName");

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    // Returning the raw project object directly to match our frontend hook
    res.status(200).json(project);
  } catch (error) {
    next(error);
  }
};

// @desc    Update a Project
// @route   PATCH /api/v1/projects/:id
// @access  Private
exports.updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const project = await Project.findOneAndUpdate(
      { _id: id, tenantId: req.tenantId },
      updates,
      { new: true, runValidators: true },
    );

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    res.status(200).json({
      message: "Project updated successfully!",
      project,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a Project
// @route   DELETE /api/v1/projects/:id
// @access  Private
exports.deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;

    const project = await Project.findOneAndDelete({
      _id: id,
      tenantId: req.tenantId,
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    res.status(200).json({
      message: "Project deleted successfully!",
    });
  } catch (error) {
    next(error);
  }
};
