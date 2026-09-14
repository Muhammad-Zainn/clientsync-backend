const errorHandler = (err, req, res, next) => {
  console.error(`Error: ${err.message}`);

  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message });
  }

  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
};

module.exports = errorHandler;
