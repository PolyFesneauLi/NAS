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

// 删除所有云端文件（仅 admin）
router.delete('/all', auth.authenticate, auth.requireRole('admin'), fileController.deleteAllFiles);
// 删除单个文件
router.delete('/:id', auth.authenticate, auth.requireRole('admin'), fileController.deleteFile);

// 批量删除文件（仅 admin）
router.post('/batch-delete', auth.authenticate, auth.requireRole('admin'), fileController.batchDeleteFiles);

module.exports = router;