const Document = require("./document.model");
const Project = require("../projects/project.model");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// @desc    Get all documents for a specific project
// @route   GET /api/v1/documents/project/:projectId
// @access  Private
exports.getProjectDocuments = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const documents = await Document.find({
      projectId,
      tenantId: req.tenantId,
    })
      .sort({ createdAt: -1 })
      .select("-__v -tenantId")
      .lean();

    res.status(200).json({
      count: documents.length,
      documents,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload any document or proposal to a project
// @route   POST /api/v1/documents/upload
// @access  Private
exports.uploadDocument = async (req, res, next) => {
  try {
    const { projectId, title, type, customContent } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    if (file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Only PDF files are allowed." });
    }

    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required." });
    }

    const project = await Project.findOne({
      _id: projectId,
      tenantId: req.tenantId,
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found." });
    }

    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "");
    const filePrefix = type === "proposal" ? "proposal" : "doc";
    const fileName = `pdfs/${filePrefix}-${Date.now()}-${safeOriginalName}`;

    const { error: uploadError } = await supabase.storage
      .from("proposals")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase Upload Error:", uploadError);
      return res
        .status(500)
        .json({ error: "Failed to upload file to cloud storage." });
    }

    const { data: publicUrlData } = supabase.storage
      .from("proposals")
      .getPublicUrl(fileName);

    const documentPayload = {
      tenantId: req.tenantId,
      projectId: project._id,
      title: title || file.originalname,
      type: type || "document",
      pdfFileUrl: publicUrlData.publicUrl,
      status: type === "proposal" ? "draft" : "final",
    };

    if (type === "proposal") {
      documentPayload.totalAmount = project.budget || 0;
      documentPayload.title = title || `${project.title} - Official Proposal`;

      if (customContent) {
        documentPayload.customContent =
          typeof customContent === "string"
            ? JSON.parse(customContent)
            : customContent;
      }
    }

    const document = await Document.create(documentPayload);

    const documentData = document.toObject();
    delete documentData.__v;
    delete documentData.tenantId;

    res.status(201).json({
      message: `${type === "proposal" ? "Proposal" : "Document"} uploaded successfully!`,
      document: documentData,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get ALL documents for the agency (Global Hub)
// @route   GET /api/v1/documents
// @access  Private (Agency Admin only)
exports.getAllDocuments = async (req, res, next) => {
  try {
    const { projectId, type } = req.query;

    let query = { tenantId: req.tenantId };

    if (projectId) query.projectId = projectId;
    if (type) query.type = type;

    const documents = await Document.find(query)
      .populate("projectId", "title clientId")
      .sort({ createdAt: -1 })
      .select("-__v -tenantId")
      .lean();

    res.status(200).json({
      count: documents.length,
      documents,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a document from Supabase and MongoDB
// @route   DELETE /api/v1/documents/:id
// @access  Private (Agency Admin only)
exports.deleteDocument = async (req, res, next) => {
  try {
    const documentId = req.params.id;

    const document = await Document.findOne({
      _id: documentId,
      tenantId: req.tenantId,
    });

    if (!document) {
      return res.status(404).json({ error: "Document not found." });
    }

    if (document.pdfFileUrl) {
      const filePathMatch = document.pdfFileUrl.split("/public/proposals/")[1];

      if (filePathMatch) {
        const cleanFilePath = filePathMatch.split("?")[0];

        const { error: supabaseError } = await supabase.storage
          .from("proposals")
          .remove([cleanFilePath]);

        if (supabaseError) {
          console.error("Supabase Deletion Error:", supabaseError);
          return res
            .status(500)
            .json({ error: "Failed to delete file from cloud storage." });
        }
      }
    }

    await Document.findByIdAndDelete(documentId);

    res.status(200).json({
      message: "Document permanently deleted from cloud and database.",
      id: documentId,
    });
  } catch (error) {
    next(error);
  }
};