require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.options('*', cors());

// ────────────────────────────────────────────────
// Connect to MongoDB **and wait** before starting server
// ────────────────────────────────────────────────
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("Error: MONGODB_URI is not defined in .env file");
  process.exit(1);
}

const connectDB = async () => {
  try {
    await mongoose.connect(mongoUri, {
      // These two are deprecated since ~2021–2022 (Node driver 4+)
      // Remove them to clean up warnings
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      
      // Optional but helpful for debugging timeouts
      serverSelectionTimeoutMS: 5000,   // Fail faster if can't find server
      socketTimeoutMS: 45000,           // Close sockets after 45s of inactivity
    });

    console.log("MongoDB connected successfully");
  } catch (err) {
    console.error("MongoDB connection FAILED:", err.message);
    process.exit(1); // Exit if DB connection is critical (you can change this)
  }
};

// Start server ONLY after DB connects
(async () => {
  await connectDB();

  // ────────────────────────────────────────────────
  // Routes (load them AFTER DB is ready)
  // ────────────────────────────────────────────────
  const signinRoute = require("./routes/login.route");
  app.use("/api/login", signinRoute);

  const userInfo = require("./routes/stats.route");
  app.use("/api/stats", userInfo);

  // Uncomment when ready
  // const saveEmailRoute = require("./routes/stats.route");
  // app.use("/api/saveemail", saveEmailRoute);

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
})();