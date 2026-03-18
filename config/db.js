const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  userId: {           // We'll store Azure object ID or mail here
    type: String,
    required: true,
    unique: true,
  },
  access_token: { type: String, required: true },
  refresh_token: { type: String, required: true },
  scope: String,
  expires_at: { type: Date, required: true },
  last_refreshed: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Token', tokenSchema);