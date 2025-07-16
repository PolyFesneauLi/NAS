const express = require('express');
const router = express.Router();
const config = require('../config');

// 获取服务器配置
router.get('/config', (req, res) => {
  res.json({
    showUserInfo: config.SHOW_USER_INFO,
    uploadMaxSize: config.UPLOAD_MAX_SIZE,
    allowedFileTypes: config.ALLOWED_FILE_TYPES
  });
});

module.exports = router; 