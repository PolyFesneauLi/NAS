const File = require('../models/File');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const { STORAGE_PATH } = process.env;

// 通用文件上传处理
const processFileUpload = async (req, res, fileType = 'regular') => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' });
    }

    const user = await User.findById(req.user.id);
    const fileSize = req.file.size;
    
    // 检查存储空间
    if (user.usedStorage + fileSize > user.storageQuota) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '存储空间不足' });
    }

    // 创建文件记录
    const file = new File({
      filename: req.file.filename,
      path: req.file.path,
      size: fileSize,
      owner: req.user.id,
      fileType,  // 添加文件类型标识
      originalName: req.file.originalname // 保留原始文件名
    });

    await file.save();
    
    // 更新用户存储使用情况
    user.usedStorage += fileSize;
    await user.save();

    return {
      message: '文件上传成功',
      file: {
        id: file._id,
        filename: file.filename,
        originalName: file.originalName,
        size: file.size,
        type: file.fileType,
        createdAt: file.createdAt,
      }
    };
  } catch (error) {
    // 上传失败时删除已存储的文件
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw error;
  }
};

// 常规文件上传
exports.uploadFile = async (req, res) => {
  try {
    const result = await processFileUpload(req, res);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ 
      error: '文件上传失败',
      details: error.message 
    });
  }
};

// CAD文件上传
exports.uploadCadFile = async (req, res) => {
  try {
    const result = await processFileUpload(req, res, 'cad');
    res.status(201).json({
      ...result,
      message: 'CAD文件上传成功' // 自定义成功消息
    });
  } catch (error) {
    res.status(500).json({
      error: 'CAD文件上传失败',
      details: error.message
    });
  }
};

// 获取用户文件列表（支持按类型筛选）
exports.getUserFiles = async (req, res) => {
  try {
    const { type } = req.query;
    const query = { owner: req.user.id };
    
    if (type) {
      query.fileType = type;
    }

    const files = await File.find(query)
      .select('filename originalName size fileType createdAt')
      .sort({ createdAt: -1 });

    res.json({
      count: files.length,
      files,
      totalUsed: (await User.findById(req.user.id)).usedStorage
    });
  } catch (error) {
    res.status(500).json({ 
      error: '获取文件列表失败',
      details: error.message 
    });
  }
};

// 下载文件（添加文件类型检查）
exports.downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查权限
    if (!file.owner.equals(req.user.id)) {
      return res.status(403).json({ error: '无权访问此文件' });
    }

    const filePath = path.join(STORAGE_PATH, file.filename);
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      await File.deleteOne({ _id: file._id });
      return res.status(410).json({ error: '文件已丢失' });
    }

    // 设置下载文件名（使用原始文件名）
    res.download(filePath, file.originalName || file.filename);
  } catch (error) {
    res.status(500).json({ 
      error: '文件下载失败',
      details: error.message 
    });
  }
};

// 删除文件（添加更完善的清理）
exports.deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查权限
    if (!file.owner.equals(req.user.id)) {
      return res.status(403).json({ error: '无权删除此文件' });
    }

    const filePath = path.join(STORAGE_PATH, file.filename);
    let storageFreed = 0;

    // 删除物理文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      storageFreed = file.size;
    }

    // 更新用户存储
    const user = await User.findById(req.user.id);
    user.usedStorage = Math.max(0, user.usedStorage - storageFreed);
    await user.save();

    // 删除数据库记录
    await File.deleteOne({ _id: file._id });

    res.json({ 
      message: '文件删除成功',
      storageFreed,
      remainingSpace: user.storageQuota - user.usedStorage
    });
  } catch (error) {
    res.status(500).json({ 
      error: '文件删除失败',
      details: error.message 
    });
  }
};