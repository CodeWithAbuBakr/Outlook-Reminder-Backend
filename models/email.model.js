const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
 
  body: { type: String, required: true },
  
});

module.exports = mongoose.model('Email', emailSchema);
