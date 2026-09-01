const Task = require("./task.model");
const Project = require("../projects/project.model");

// @desc    Create a new Task
// @route   POST /api/v1/tasks
// @access  Private
exports.createTask = async (req, res, next) => {
  try {
    const { title, description, status, projectId } = req.body;

    if (!title || !projectId) {
      return res
        .status(400)
        .json({ error: "Title and Project ID are required." });
    }

    // Security: Ensure the project belongs to this agency's tenant
    const projectExists = await Project.findOne({
      _id: projectId,
      tenantId: req.tenantId,
    });
    if (!projectExists) {
      return res
        .status(404)
        .json({ error: "Project not found or unauthorized." });
    }

    const task = await Task.create({
      tenantId: req.tenantId,
      projectId,
      title,
      description,
      status: status || "todo",
    });

    res.status(201).json({
      message: "Task created successfully!",
      task,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all Tasks for a specific Project
// @route   GET /api/v1/tasks/project/:projectId
// @access  Private
exports.getProjectTasks = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const tasks = await Task.find({
      projectId,
      tenantId: req.tenantId,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a Task status (for Kanban drag-and-drop)
// @route   PATCH /api/v1/tasks/:id
// @access  Private
exports.updateTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const task = await Task.findOneAndUpdate(
      { _id: id, tenantId: req.tenantId },
      updates,
      { new: true, runValidators: true },
    );

    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    res.status(200).json({
      message: "Task updated successfully!",
      task,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a Task
// @route   DELETE /api/v1/tasks/:id
// @access  Private
exports.deleteTask = async (req, res, next) => {
  try {
    const { id } = req.params;

    const task = await Task.findOneAndDelete({
      _id: id,
      tenantId: req.tenantId,
    });

    if (!task) {
      return res.status(404).json({ error: "Task not found." });
    }

    res.status(200).json({
      message: "Task deleted successfully!",
    });
  } catch (error) {
    next(error);
  }
};
