const express = require('express');
const router = express.Router();
const fileController = require('../controllers/fileController');
const auth = require('../utils/auth');
const { upload, cadUpload } = require('../utils/storage');

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

// 获取用户文件
router.get('/', auth.authenticate, fileController.getUserFiles);

// 下载文件
router.get('/download/:id', auth.authenticate, fileController.downloadFile);

// 下载文件夹
router.get('/download-folder/:id', auth.authenticate, fileController.downloadFolder);

// 批量下载文件和文件夹
router.post('/batch-download', auth.authenticate, fileController.batchDownload);

// 检查文件状态
router.get('/check/:id', auth.authenticate, fileController.checkFileStatus);

// 删除所有云端文件（仅 admin）
router.delete('/all', auth.authenticate, auth.requireRole('admin'), fileController.deleteAllFiles);
// 删除单个文件
router.delete('/:id', auth.authenticate, auth.requireRole('admin'), fileController.deleteFile);

// 批量删除文件（仅 admin）
router.post('/batch-delete', auth.authenticate, auth.requireRole('admin'), fileController.batchDeleteFiles);

// 创建文件夹（仅 admin）
router.post('/create-folder', auth.authenticate, auth.requireRole('admin'), fileController.createFolder);

module.exports = router;