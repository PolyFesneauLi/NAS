const File = require('../models/File');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const { STORAGE_PATH } = process.env;
const config = require('../config');

// 检查用户权限
const checkAdminPermission = (user) => {
  if (!user || user.role !== 'admin') {
    throw new Error('Permission denied: Only admin can upload files');
  }
};

// 通用文件上传处理
const processFileUpload = async (req, res, fileType = 'regular') => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' });
    }

    const user = await User.findById(req.user.id);
    const fileSize = req.file.size;
    const folderId = req.body.folderId;
    
    // 检查存储空间
    if (user.usedStorage + fileSize > user.storageQuota) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '存储空间不足' });
    }

    // 如果没有指定文件夹，使用home目录
    let targetFolder = null;
    if (!folderId) {
      targetFolder = await File.findOne({ 
        isFolder: true, 
        parentFolder: null,
        filename: "home"
      });
      
      if (!targetFolder) {
        fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'Home目录不存在，系统配置错误' });
      }
    } else {
      targetFolder = await File.findOne({ _id: folderId, isFolder: true });
      if (!targetFolder) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: '目标文件夹不存在' });
      }
    }

    // 移动文件到目标位置
    let filePath = req.file.path;
    if (targetFolder.filename === "home") {
      // 如果是home目录，文件放在 uploads/home 目录下
      filePath = path.join(STORAGE_PATH, "home", path.basename(req.file.path));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.renameSync(req.file.path, filePath);
    } else {
      // 否则放在目标文件夹下
      const newPath = path.join(path.dirname(req.file.path), targetFolder.filename, path.basename(req.file.path));
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      fs.renameSync(req.file.path, newPath);
      filePath = newPath;
    }

    // 创建文件记录
    const file = new File({
      filename: path.basename(filePath),
      path: filePath,
      size: fileSize,
      owner: req.user.id,
      fileType,
      originalName: decodeURIComponent(req.file.originalname),
      parentFolder: targetFolder._id
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
        parentFolder: file.parentFolder
      }
    };
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw error;
  }
};

// 检查用户存储空间
const checkStorageQuota = async (user, fileSize) => {
  if (!user) return true;
  
  // 获取用户已使用的存储空间
  const usedStorage = user.usedStorage || 0;
  
  // 检查是否超过配额
  if (usedStorage + fileSize > config.DEFAULT_STORAGE_QUOTA) {
    throw new Error('Storage quota exceeded');
  }
  
  return true;
};

// 常规文件上传
exports.uploadFile = async (req, res) => {
  try {
    // 检查管理员权限
    checkAdminPermission(req.user);

    const result = await processFileUpload(req, res);
    res.status(201).json(result);
  } catch (error) {
    console.error('File upload error:', error);
    res.status(error.message.includes('Permission denied') ? 403 : 500)
       .json({ error: error.message });
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

// 获取所有文件列表（支持按类型筛选、排序和搜索）
exports.getUserFiles = async (req, res) => {
  try {
    const { type, sort, search, folder } = req.query;
    const query = {};
    
    // 按类型筛选
    if (type) {
      query.fileType = type;
    }

    // 如果没有指定文件夹，默认显示home目录内容
    if (!folder) {
      const homeFolder = await File.findOne({ 
        isFolder: true, 
        filename: "home",
        parentFolder: null 
      });
      if (homeFolder) {
        query.parentFolder = homeFolder._id;
      } else {
        return res.status(500).json({ error: 'Home目录不存在' });
      }
    } else {
      query.parentFolder = folder;
    }
    
    // 搜索功能 - 文件名部分匹配
    if (search) {
      const decodedSearch = decodeURIComponent(search);
      query.$or = [
        { originalName: { $regex: decodedSearch, $options: 'i' } },
        { path: { $regex: decodedSearch, $options: 'i' } }
      ];
    }
    
    // 排序功能
    let sortOption = { isFolder: -1, createdAt: -1 }; // 默认文件夹在前，按上传时间倒序
    
    if (sort) {
      switch (sort) {
        case 'time_asc':
          sortOption = { isFolder: -1, createdAt: 1 };
          break;
        case 'time_desc':
          sortOption = { isFolder: -1, createdAt: -1 };
          break;
        case 'size_asc':
          sortOption = { isFolder: -1, size: 1 };
          break;
        case 'size_desc':
          sortOption = { isFolder: -1, size: -1 };
          break;
        case 'name_asc':
          sortOption = { isFolder: -1, originalName: 1 };
          break;
        case 'name_desc':
          sortOption = { isFolder: -1, originalName: -1 };
          break;
        case 'extension_asc':
          sortOption = { isFolder: -1, originalName: 1 };
          break;
        case 'extension_desc':
          sortOption = { isFolder: -1, originalName: -1 };
          break;
        default:
          sortOption = { isFolder: -1, createdAt: -1 };
      }
    }

    let files = await File.find(query)
      .collation({ locale: 'zh' })
      .select('filename originalName size fileType createdAt isFolder parentFolder')
      .sort(sortOption);

    // 获取当前文件夹信息
    let currentFolder = null;
    if (folder) {
      currentFolder = await File.findById(folder)
        .select('filename originalName parentFolder');
    } else {
      // 如果在根目录，返回home文件夹信息
      currentFolder = await File.findOne({ 
        isFolder: true, 
        filename: "home",
        parentFolder: null 
      }).select('filename originalName parentFolder');
    }

    res.json({
      count: files.length,
      files,
      currentFolder
    });
  } catch (error) {
    res.status(500).json({ 
      error: '获取文件列表失败',
      details: error.message 
    });
  }
};

// 下载文件（所有用户可下载）
exports.downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }
    const filePath = path.join(STORAGE_PATH, file.filename);
    if (!fs.existsSync(filePath)) {
      await File.deleteOne({ _id: file._id });
      return res.status(410).json({ error: '文件已丢失' });
    }
    
    // 处理中文文件名编码
    const originalName = file.originalName || file.filename;
    
    // 为不同浏览器设置兼容的响应头
    const userAgent = req.headers['user-agent'] || '';
    let filename;
    
    if (userAgent.includes('MSIE') || userAgent.includes('Trident')) {
      // IE浏览器
      filename = encodeURIComponent(originalName);
    } else if (userAgent.includes('Firefox')) {
      // Firefox浏览器
      filename = `filename*=UTF-8''${encodeURIComponent(originalName)}`;
    } else {
      // Chrome, Safari, Edge等现代浏览器
      filename = `filename="${encodeURIComponent(originalName)}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
    }
    
    res.setHeader('Content-Disposition', `attachment; ${filename}`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // 创建文件流并发送
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
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
    if (!file.owner.equals(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权删除此文件' });
    }
    const filePath = path.join(STORAGE_PATH, file.filename);
    let storageFreed = 0;
    // 删除物理文件
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      storageFreed = file.size;
    }
    // 更新 owner 用户存储
    const user = await User.findById(file.owner);
    if (user) {
      user.usedStorage = Math.max(0, user.usedStorage - storageFreed);
      await user.save();
    }
    // 删除数据库记录
    await File.deleteOne({ _id: file._id });
    res.json({ 
      message: '文件删除成功',
      storageFreed,
      remainingSpace: user ? user.storageQuota - user.usedStorage : undefined
    });
  } catch (error) {
    res.status(500).json({ 
      error: '文件删除失败',
      details: error.message 
    });
  }
};

// 删除所有云端文件（仅 admin）
exports.deleteAllFiles = async (req, res) => {
  try {
    const files = await File.find({});
    let deletedCount = 0;
    // 统计每个用户释放的空间
    const userStorageMap = {};
    for (const file of files) {
      // 删除物理文件
      if (file.path && require('fs').existsSync(file.path)) {
        require('fs').unlinkSync(file.path);
      }
      // 统计 owner 空间
      if (file.owner) {
        userStorageMap[file.owner] = (userStorageMap[file.owner] || 0) + file.size;
      }
      deletedCount++;
    }
    // 批量更新所有相关用户的 usedStorage
    const User = require('../models/User');
    for (const [userId, freed] of Object.entries(userStorageMap)) {
      const user = await User.findById(userId);
      if (user) {
        user.usedStorage = Math.max(0, user.usedStorage - freed);
        await user.save();
      }
    }
    await File.deleteMany({});
    res.json({ message: `已删除所有云端文件，共 ${deletedCount} 个` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 批量删除文件（仅 admin）
exports.batchDeleteFiles = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '缺少文件id数组' });
    }
    const files = await File.find({ _id: { $in: ids } });
    if (!files.length) {
      return res.status(404).json({ error: '未找到要删除的文件' });
    }
    // 统计每个用户释放的空间
    const userStorageMap = {};
    let deletedCount = 0;
    for (const file of files) {
      // 删除物理文件
      if (file.path && require('fs').existsSync(file.path)) {
        require('fs').unlinkSync(file.path);
      }
      // 统计 owner 空间
      if (file.owner) {
        userStorageMap[file.owner] = (userStorageMap[file.owner] || 0) + file.size;
      }
      deletedCount++;
    }
    // 批量更新所有相关用户的 usedStorage
    const User = require('../models/User');
    for (const [userId, freed] of Object.entries(userStorageMap)) {
      const user = await User.findById(userId);
      if (user) {
        user.usedStorage = Math.max(0, user.usedStorage - freed);
        await user.save();
      }
    }
    await File.deleteMany({ _id: { $in: ids } });
    res.json({ message: `已删除${deletedCount}个文件` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 创建文件夹
exports.createFolder = async (req, res) => {
  try {
    const { folderName } = req.body;
    const parentFolderId = req.body.parentFolder;
    
    if (!folderName || !folderName.trim()) {
      return res.status(400).json({ error: '文件夹名称不能为空' });
    }

    // 如果没有指定父文件夹，则使用home目录作为父文件夹
    let parentFolder = null;
    if (!parentFolderId) {
      parentFolder = await File.findOne({ 
        isFolder: true, 
        parentFolder: null,
        filename: "home"
      });
      
      if (!parentFolder) {
        return res.status(500).json({ error: 'Home目录不存在，系统配置错误' });
      }
    } else {
      parentFolder = await File.findOne({ _id: parentFolderId, isFolder: true });
      if (!parentFolder) {
        return res.status(404).json({ error: '父文件夹不存在' });
      }
    }

    // 检查同级目录下是否已存在同名文件夹
    const existingFolder = await File.findOne({
      originalName: folderName,
      parentFolder: parentFolder._id,
      isFolder: true
    });

    if (existingFolder) {
      return res.status(400).json({ error: '同名文件夹已存在' });
    }

    // 构建物理路径
    let folderPath;
    if (parentFolder.filename === "home") {
      // 如果父文件夹是home目录，在 uploads/home 下创建
      folderPath = path.join(STORAGE_PATH, "home", folderName);
    } else {
      // 否则在父文件夹下创建
      folderPath = path.join(STORAGE_PATH, parentFolder.filename, folderName);
    }

    // 创建物理文件夹
    fs.mkdirSync(folderPath, { recursive: true });

    // 创建文件夹记录
    const folder = new File({
      filename: folderName,
      path: folderPath,
      size: 0,
      owner: req.user.id,
      isFolder: true,
      originalName: folderName,
      parentFolder: parentFolder._id
    });

    await folder.save();

    res.status(201).json({
      message: '文件夹创建成功',
      folder: {
        id: folder._id,
        name: folder.filename,
        createdAt: folder.createdAt,
        parentFolder: folder.parentFolder
      }
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ 
      error: '创建文件夹失败',
      details: error.message 
    });
  }
};

module.exports = exports;