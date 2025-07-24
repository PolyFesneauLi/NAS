const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../utils/auth');

// 获取所有用户（仅管理员）
router.get('/all', auth.authenticate, auth.requireRole('admin'), userController.getAllUsers);

// 删除用户（仅管理员）
router.delete('/:userId', auth.authenticate, auth.requireRole('admin'), userController.deleteUser);

// 获取当前用户信息
router.get('/me', auth.authenticate, userController.getCurrentUser);

// 获取待审核用户列表（仅管理员）
router.get('/pending', auth.authenticate, auth.requireRole('admin'), userController.getPendingUsers);

// 审核通过用户（仅管理员）
router.post('/:userId/approve', auth.authenticate, auth.requireRole('admin'), userController.approveUser);

// 拒绝用户注册（仅管理员）
router.post('/:userId/reject', auth.authenticate, auth.requireRole('admin'), userController.rejectUser);

// 修改用户权限（仅管理员）
router.put('/:userId/role', auth.authenticate, auth.requireRole('admin'), userController.changeUserRole);

// 更新用户存储配额
router.put('/quota', auth.authenticate, userController.updateStorageQuota);

// 删除所有用户（仅 admin）
router.delete('/all', auth.authenticate, auth.requireRole('admin'), userController.deleteAllUsers);

// 危险接口：不需要admin权限，允许任何人删除所有用户，仅开发用
router.delete('/all-force', userController.deleteAllUsers);

// 重置当前用户已用空间为0
router.post('/reset-used', auth.authenticate, userController.resetUsedStorage);

// 获取所有admin用户的存储使用情况总和
router.get('/admin-storage', auth.authenticate, auth.requireRole('admin'), userController.getAdminStorageUsage);

module.exports = router;