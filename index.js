require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const mongoUri = process.env.MONGODB_URI; // Replace with your MongoDB URI

const app = express();
const port = process.env.PORT || 4000;

// Middleware to parse JSON and URL-encoded data with increased limit
app.use(express.json({ limit: '50mb' })); // Increase the limit as needed
app.use(express.urlencoded({ limit: '50mb', extended: true }));
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use(cors());

// Enable preflight requests for all routes
app.options('*', cors());

/// Routes
// const saveEmailRoute = require("./routes/stats.route");

// app.use("/api/saveemail", saveEmailRoute);

const signinRoute = require("./routes/login.route");
app.use("/api/login", signinRoute);

const userInfo = require("./routes/stats.route");
app.use("/api/stats", userInfo);



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
