const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../utils/auth');

// 获取当前用户信息
router.get('/me', auth.authenticate, userController.getCurrentUser);

// 更新用户存储配额
router.put('/quota', auth.authenticate, userController.updateStorageQuota);

// 删除所有用户（仅 admin）
router.delete('/all', auth.authenticate, auth.requireRole('admin'), userController.deleteAllUsers);

// 危险接口：不需要admin权限，允许任何人删除所有用户，仅开发用
router.delete('/all-force', userController.deleteAllUsers);

// 重置当前用户已用空间为0
router.post('/reset-used', auth.authenticate, userController.resetUsedStorage);

module.exports = router;