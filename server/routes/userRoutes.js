const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../utils/auth');

// 获取当前用户信息
router.get('/me', auth.authenticate, userController.getCurrentUser);

// 删除所有用户（仅admin）
router.delete('/all', auth.authenticate, auth.requireRole('admin'), userController.deleteAllUsers);

module.exports = router;