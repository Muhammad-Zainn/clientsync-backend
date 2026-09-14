const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "proposal",
        "invoice",
        "api_spec",
        "contract",
        "document",
        "brief",
      ],
      required: true,
    },
    totalAmount: {
      type: Number,
    },
    customContent: {
      type: Object,
      default: {},
    },
    pdfFileUrl: {
      type: String,
    },
    status: {
      type: String,
      enum: ["draft", "sent", "paid", "signed", "final"],
      default: "draft",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Document", documentSchema);
