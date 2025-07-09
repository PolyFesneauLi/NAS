const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  storageQuota: {
    type: Number,
    default: 1024 * 1024 * 1024, // 1GB
  },
  usedStorage: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  role: {
    type: String,
    enum: ['admin', 'normal'],
    default: 'normal',
  },
});

module.exports = mongoose.model('User', UserSchema);