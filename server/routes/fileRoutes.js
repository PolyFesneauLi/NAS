const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const auth = require('../utils/auth');
const { upload, cadUpload, folderUpload } = require('../utils/storage');

// 常规文件上传
router.post('/upload', 
  auth.authenticate, 
  auth.requireRole('admin'),
  upload.single('file'), 
  fileController.uploadFile
);

// CAD文件上传
router.post('/upload-cad',
  auth.authenticate,
  auth.requireRole('admin'),
  cadUpload.single('file'),
  fileController.uploadCadFile
);

// 上传文件夹
router.post('/upload-folder',
  auth.authenticate,
  auth.requireRole('admin'),
  folderUpload.array('files'),
  fileController.uploadFolder
);

// 获取用户文件 用于文件搜索
router.get('/', auth.authenticate, fileController.searchFiles);

// 获取归档进度
router.get('/archiving-progress', auth.authenticate, fileController.getArchivingProgress);

// 下载文件
router.get('/download/:id', auth.authenticate, fileController.downloadFile);

// 下载文件夹
router.get('/download-folder/:id', auth.authenticate, fileController.downloadFolder);

// 检查文件夹下载状态
router.get('/check-folder/:id', auth.authenticate, fileController.checkFolderDownloadStatus);

// 检查文件状态
router.get('/check/:id', auth.authenticate, fileController.checkFileStatus);

// 标签相关路由
// 获取所有标签（所有认证用户都可以访问，用于搜索）
router.get('/tags', auth.authenticate, fileController.getAllTags);
// 标签管理（仅 admin）
router.post('/add-tags', auth.authenticate, auth.requireRole('admin'), fileController.addTags);
router.post('/remove-tags', auth.authenticate, auth.requireRole('admin'), fileController.removeTags);
router.post('/create-tag', auth.authenticate, auth.requireRole('admin'), fileController.createTag);
router.post('/update-tag-order', auth.authenticate, auth.requireRole('admin'), fileController.updateTagOrder);
router.delete('/delete-tag', auth.authenticate, auth.requireRole('admin'), fileController.deleteTag);
router.post('/force-delete-tag', auth.authenticate, auth.requireRole('admin'), fileController.forceDeleteTag);
// 清理孤立标签(有usecount>0 但是其实没有文件关联的标签 -> 效果：删除标签)
router.post('/cleanup-orphaned-tags', auth.authenticate, auth.requireRole('admin'), fileController.cleanupOrphanedTags);

// 重命名文件（仅 admin）- 必须放在 /:id 路由之前
router.put('/rename/:id', auth.authenticate, auth.requireRole('admin'), fileController.renameFile);

// 获取单个文件详情（放在最后，避免与其他路由冲突）
router.get('/:id', auth.authenticate, fileController.getFileDetails);

// 删除所有云端文件（仅 admin）
router.delete('/all', auth.authenticate, auth.requireRole('admin'), fileController.deleteAllFiles);
// 删除单个文件
router.delete('/:id', auth.authenticate, auth.requireRole('admin'), fileController.deleteFile);

// 批量删除文件（仅 admin）
router.post('/batch-delete', auth.authenticate, auth.requireRole('admin'), fileController.batchDeleteFiles);

// 创建文件夹（仅 admin）
router.post('/create-folder', auth.authenticate, auth.requireRole('admin'), fileController.createFolder);

module.exports = router;