const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../utils/auth');

// 获取当前用户信息
router.get('/me', auth.authenticate, userController.getCurrentUser);

// 更新用户存储配额
router.put('/quota', auth.authenticate, userController.updateStorageQuota);

module.exports = router;