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
    // console.log('[SERVER] 开始处理文件上传请求');
    if (!req.file) {
      // console.log('[SERVER] 错误: 未找到上传的文件');
      return res.status(400).json({ error: '未上传文件' });
    }
    // console.log('[SERVER] 文件信息:', {
    //   originalName: req.file.originalname,
    //   size: req.file.size,
    //   mimetype: req.file.mimetype,
    //   path: req.file.path
    // });

    const user = await User.findById(req.user.id);
    // console.log('[SERVER] 用户信息:', {
    //   id: user._id,
    //   usedStorage: user.usedStorage,
    //   storageQuota: user.storageQuota
    // });

    const fileSize = req.file.size;
    const folderId = req.body.folderId;
    // console.log('[SERVER] 目标文件夹ID:', folderId || 'home');
    
    // 检查存储空间
    if (user.usedStorage + fileSize > user.storageQuota) {
      // console.log('[SERVER] 错误: 存储空间不足');
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '存储空间不足' });
    }

    // 如果没有指定文件夹，使用home目录
    let targetFolder = null;
    if (!folderId) {
      // console.log('[SERVER] 未指定目标文件夹，使用home目录');
      targetFolder = await File.findOne({ 
        isFolder: true, 
        parentFolder: null,
        filename: "home"
      });
      
      if (!targetFolder) {
        // console.log('[SERVER] 错误: Home目录不存在');
        fs.unlinkSync(req.file.path);
        return res.status(500).json({ error: 'Home目录不存在，系统配置错误' });
      }
    } else {
      // console.log('[SERVER] 查找目标文件夹:', folderId);
      targetFolder = await File.findOne({ _id: folderId, isFolder: true });
      if (!targetFolder) {
        // console.log('[SERVER] 错误: 目标文件夹不存在');
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: '目标文件夹不存在' });
      }
    }
    // console.log('[SERVER] 目标文件夹信息:', {
    //   id: targetFolder._id,
    //   name: targetFolder.filename,
    //   path: targetFolder.path
    // });

    // 移动文件到目标位置
    let filePath = req.file.path;
    // console.log('[SERVER] 原始文件路径:', filePath);
    
    if (targetFolder.filename === "home") {
      // console.log('[SERVER] 移动文件到home目录');
      filePath = path.join(STORAGE_PATH, "home", path.basename(req.file.path));
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.renameSync(req.file.path, filePath);
    } else {
      // console.log('[SERVER] 移动文件到目标文件夹');
      const newPath = path.join(path.dirname(req.file.path), targetFolder.filename, path.basename(req.file.path));
      fs.mkdirSync(path.dirname(newPath), { recursive: true });
      fs.renameSync(req.file.path, newPath);
      filePath = newPath;
    }
    // console.log('[SERVER] 最终文件路径:', filePath);

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

    // console.log('[SERVER] 保存文件记录到数据库');
    await file.save();
    // console.log('[SERVER] 文件记录已保存:', {
    //   id: file._id,
    //   filename: file.filename,
    //   size: file.size
    // });
    
    // 更新用户存储使用情况
    user.usedStorage += fileSize;
    // console.log('[SERVER] 更新用户存储使用情况:', {
    //   oldUsed: user.usedStorage - fileSize,
    //   newUsed: user.usedStorage,
    //   quota: user.storageQuota
    // });
    await user.save();

    // console.log('[SERVER] 文件上传处理完成，准备返回响应');
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
    // console.log('[SERVER] 处理文件上传时发生错误:', {
    //   message: error.message,
    //   stack: error.stack
    // });
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

// 递归删除文件夹及其内容
const recursiveDelete = async (folderId, userStorageMap = {}) => {
  const folder = await File.findById(folderId);
  if (!folder || !folder.isFolder) return 0;

  // 获取文件夹下的所有文件和子文件夹
  const children = await File.find({ parentFolder: folderId });
  let totalFreed = 0;

  // 递归删除每个子项
  for (const child of children) {
    if (child.isFolder) {
      totalFreed += await recursiveDelete(child._id, userStorageMap);
    } else {
      // 删除文件
      if (child.path && fs.existsSync(child.path)) {
        fs.unlinkSync(child.path);
        totalFreed += child.size;
        
        // 记录用户存储空间变化
        if (child.owner) {
          userStorageMap[child.owner] = (userStorageMap[child.owner] || 0) + child.size;
        }
      }
      await File.deleteOne({ _id: child._id });
    }
  }

  // 删除文件夹本身
  if (folder.path && fs.existsSync(folder.path)) {
    try {
      fs.rmdirSync(folder.path);
    } catch (error) {
      console.error(`删除文件夹 ${folder.path} 失败:`, error);
    }
  }
  await File.deleteOne({ _id: folderId });

  return totalFreed;
};

// 删除文件（支持文件夹）
const deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查权限
    if (!file.owner.equals(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权删除此文件' });
    }

    let storageFreed = 0;
    const userStorageMap = {};

    if (file.isFolder) {
      // 递归删除文件夹及其内容
      storageFreed = await recursiveDelete(file._id, userStorageMap);
    } else {
      // 删除单个文件
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
        storageFreed = file.size;
        userStorageMap[file.owner] = file.size;
      }
      await File.deleteOne({ _id: file._id });
    }

    // 更新所有受影响用户的存储空间
    for (const [userId, freed] of Object.entries(userStorageMap)) {
      const user = await User.findById(userId);
      if (user) {
        user.usedStorage = Math.max(0, user.usedStorage - freed);
        await user.save();
      }
    }

    res.json({ 
      message: `${file.isFolder ? '文件夹' : '文件'}删除成功`,
      storageFreed,
      remainingSpace: userStorageMap[file.owner] ? 
        (await User.findById(file.owner))?.storageQuota - (await User.findById(file.owner))?.usedStorage : 
        undefined
    });
  } catch (error) {
    res.status(500).json({ 
      error: `${file?.isFolder ? '文件夹' : '文件'}删除失败`,
      details: error.message 
    });
  }
};

// 删除所有云端文件（仅 admin）
const deleteAllFiles = async (req, res) => {
  try {
    const files = await File.find({});
    let deletedCount = 0;
    // 统计每个用户释放的空间
    const userStorageMap = {};
    for (const file of files) {
      // 删除物理文件
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      // 统计 owner 空间
      if (file.owner) {
        userStorageMap[file.owner] = (userStorageMap[file.owner] || 0) + file.size;
      }
      deletedCount++;
    }
    // 批量更新所有相关用户的 usedStorage
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

// 批量删除文件（支持文件夹）
const batchDeleteFiles = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '缺少文件id数组' });
    }

    const files = await File.find({ _id: { $in: ids } });
    if (!files.length) {
      return res.status(404).json({ error: '未找到要删除的文件' });
    }

    const userStorageMap = {};
    let deletedCount = 0;
    let totalFreed = 0;

    for (const file of files) {
      if (file.isFolder) {
        // 递归删除文件夹
        totalFreed += await recursiveDelete(file._id, userStorageMap);
      } else {
        // 删除单个文件
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          totalFreed += file.size;
          if (file.owner) {
            userStorageMap[file.owner] = (userStorageMap[file.owner] || 0) + file.size;
          }
        }
        await File.deleteOne({ _id: file._id });
      }
      deletedCount++;
    }

    // 更新所有受影响用户的存储空间
    for (const [userId, freed] of Object.entries(userStorageMap)) {
      const user = await User.findById(userId);
      if (user) {
        user.usedStorage = Math.max(0, user.usedStorage - freed);
        await user.save();
      }
    }

    res.json({ 
      message: `已删除${deletedCount}个文件/文件夹`,
      storageFreed: totalFreed,
      affectedUsers: Object.keys(userStorageMap).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 创建文件夹
const createFolder = async (req, res) => {
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

// 获取用户文件列表
const getUserFiles = async (req, res) => {
  try {
    const folderId = req.query.folder;
    const query = { owner: req.user.id };
    
    if (folderId) {
      query.parentFolder = folderId;
    } else {
      // 如果没有指定文件夹，获取home目录下的文件
      const homeFolder = await File.findOne({ 
        isFolder: true, 
        parentFolder: null,
        filename: "home"
      });
      
      if (!homeFolder) {
        return res.status(500).json({ error: 'Home目录不存在，系统配置错误' });
      }
      query.parentFolder = homeFolder._id;
    }

    const files = await File.find(query).sort({ isFolder: -1, filename: 1 });
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 下载文件
const downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查权限
    if (!file.owner.equals(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权下载此文件' });
    }

    if (!file.path || !fs.existsSync(file.path)) {
      return res.status(404).json({ error: '文件不存在或已被删除' });
    }

    res.download(file.path, file.originalName || file.filename);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 导出所有控制器函数
const uploadFile = async (req, res) => {
  try {
    console.log('[SERVER] 收到普通文件上传请求');
    const result = await processFileUpload(req, res, 'regular');
    console.log('[SERVER] 上传处理完成，发送成功响应');
    res.status(200).json(result);
  } catch (error) {
    console.log('[SERVER] 普通文件上传失败:', error.message);
    res.status(500).json({ 
      error: '文件上传失败',
      details: error.message 
    });
  }
};

const uploadCadFile = async (req, res) => {
  try {
    console.log('[SERVER] 收到CAD文件上传请求');
    const result = await processFileUpload(req, res, 'cad');
    console.log('[SERVER] 上传处理完成，发送成功响应');
    res.status(200).json(result);
  } catch (error) {
    console.log('[SERVER] CAD文件上传失败:', error.message);
    res.status(500).json({ 
      error: '文件上传失败',
      details: error.message 
    });
  }
};

module.exports = {
  uploadFile,
  uploadCadFile,
  getUserFiles,
  downloadFile,
  deleteFile,
  deleteAllFiles,
  batchDeleteFiles,
  createFolder
};