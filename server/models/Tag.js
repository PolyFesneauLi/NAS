const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  color: {
    type: String,
    required: true,
    default: '#4361ee'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  usageCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 更新时间戳
tagSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// 创建索引以提高查询性能
tagSchema.index({ name: 1 });
tagSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Tag', tagSchema); 