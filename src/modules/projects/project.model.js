const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedStaff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    title: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["planning", "in_progress", "client_review", "completed"],
      default: "planning",
    },
    budget: {
      type: Number,
    },
    dueDate: {
      type: Date,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Project", projectSchema);
