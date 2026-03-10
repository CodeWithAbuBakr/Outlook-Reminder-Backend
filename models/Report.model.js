const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  campaignId: { type: String, required: true },
  body: { type: String, required: true }, // Field for storing the email body
  timestamp: { type: Date, default: Date.now } // Optional field for tracking when the report was created
});

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;
