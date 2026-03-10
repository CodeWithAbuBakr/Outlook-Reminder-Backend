const express = require("express");
const mongoose = require('mongoose'); // Mongoose for MongoDB connection
const router = express.Router();

// MongoDB Report model (assuming you have a Report model defined in '../models/Report.model.js')
const Report = require('../models/Report.model.js');

// POST route to report phishing and save email body
router.post('/reportPhishing', async (req, res) => {
  const { userId, campaignId } = req.query;
  const { body } = req.body; // Get email body from the request payload

  // Validate required fields
  if (!userId || !campaignId || !body) {
    return res.status(400).json({ msg: 'userId, campaignId, and email body are required' });
  }

  try {
    // Create a new report document using the Report model
    const newReport = new Report({
      userId,
      campaignId,
      body, // Store the email body in the report
      timestamp: new Date() // Optional: add a timestamp
    });

    // Save the report data to MongoDB
    await newReport.save();

    return res.status(201).json({ msg: 'Phishing report and email body saved successfully', report: newReport });
  } catch (error) {
    console.error(`Error saving phishing report: ${error.message}`);
    return res.status(500).json({ msg: 'Failed to save phishing report', error: error.message });
  }
});

module.exports = router;
