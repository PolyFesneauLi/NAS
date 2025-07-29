const File = require('../models/File');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const { STORAGE_PATH } = process.env;
const config = require('../config');

const FixEncoding = (str) => {
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str;
  }
};

// 递归获取文件夹的完整路径
const getFolderFullPath = async (folderId) => {
  try {
    const pathParts = [];
    let currentFolderId = folderId;
    
    while (currentFolderId) {
      const folder = await File.findById(currentFolderId);
      if (!folder) break;
      
      pathParts.unshift(folder.filename);
      currentFolderId = folder.parentFolder;
    }
    
    return pathParts.join('/');
  } catch (error) {
    console.error('获取文件夹完整路径失败:', error);
    return '';
  }
};

// 递归更新父文件夹的更新时间
const updateParentFoldersTimestamp = async (folderId) => {
  try {
    let currentFolderId = folderId;
    
    while (currentFolderId) {
      const folder = await File.findById(currentFolderId);
      if (!folder) break;
      
      // 更新文件夹的更新时间
      folder.updatedAt = new Date();
      await folder.save();
      
      // 继续向上查找父文件夹
      currentFolderId = folder.parentFolder;
    }
  } catch (error) {
    console.error('更新父文件夹时间戳失败:', error);
  }
};

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

    // 检查权限 - 只有管理员可以上传文件
    if (user.role !== 'admin') {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: '只有管理员可以上传文件' });
    }

    const fileSize = req.file.size;
    const folderId = req.body.folderId;
    // console.log('[SERVER] 目标文件夹ID:', folderId || 'home');
    
    // 检查存储空间
    if (user.usedStorage + fileSize > (user.storageQuota||config.DEFAULT_STORAGE_QUOTA)) {
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
    
    // 获取目标文件夹的完整路径
    const folderFullPath = await getFolderFullPath(targetFolder._id);
    console.log('[SERVER] 目标文件夹完整路径:', folderFullPath);
    
    // 构建文件在存储中的完整路径
    const fileName = path.basename(req.file.path);
    filePath = path.join(STORAGE_PATH, folderFullPath, fileName);
    console.log('[SERVER] 文件最终路径:', filePath);
    
    // 确保目录存在
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.renameSync(req.file.path, filePath);

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

    // 递归更新父文件夹的更新时间
    await updateParentFoldersTimestamp(targetFolder._id);

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
        updatedAt: file.updatedAt,
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
  if (!folder || !folder.isFolder) {
    return 0;
  }

  // 获取所有子项
  const children = await File.find({ parentFolder: folderId });
  let totalFreed = 0;

  // 递归删除每个子项
  for (const child of children) {
    if (child.isFolder) {
      totalFreed += await recursiveDelete(child._id, userStorageMap);
    } else {
      // 删除文件
      if (child.path && fs.existsSync(child.path)) {
        try {
          fs.unlinkSync(child.path);
          totalFreed += child.size;
          
          // 记录用户存储空间变化
          if (child.owner) {
            userStorageMap[child.owner] = (userStorageMap[child.owner] || 0) + child.size;
          }
        } catch (error) {
          console.error(`删除文件 ${child.path} 失败:`, error);
        }
      }
      await File.deleteOne({ _id: child._id });
    }
  }

  // 删除文件夹本身 - 使用fs.rmSync强制删除非空文件夹
  if (folder.path && fs.existsSync(folder.path)) {
    try {
      // 使用fs.rmSync强制删除文件夹及其所有内容
      fs.rmSync(folder.path, { recursive: true, force: true });
      console.log(`成功删除文件夹: ${folder.path}`);
    } catch (error) {
      console.error(`删除文件夹 ${folder.path} 失败:`, error);
      // 如果rmSync失败，尝试手动删除
      try {
        const deleteFolderRecursively = (dirPath) => {
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
              const curPath = path.join(dirPath, file);
              if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursively(curPath);
              } else {
                fs.unlinkSync(curPath);
              }
            }
            fs.rmdirSync(dirPath);
          }
        };
        deleteFolderRecursively(folder.path);
        console.log(`手动删除文件夹成功: ${folder.path}`);
      } catch (manualError) {
        console.error(`手动删除文件夹 ${folder.path} 也失败:`, manualError);
      }
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

    // 检查权限 - 只有管理员可以删除文件
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以删除文件' });
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

    // 递归更新父文件夹的更新时间
    if (file.parentFolder) {
      await updateParentFoldersTimestamp(file.parentFolder);
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

    // 检查权限 - 只有管理员可以批量删除文件
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以删除文件' });
    }

    const userStorageMap = {};
    let deletedCount = 0;
    let totalFreed = 0;
    const affectedParentFolders = new Set(); // 记录受影响的父文件夹

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
      
      // 记录受影响的父文件夹
      if (file.parentFolder) {
        affectedParentFolders.add(file.parentFolder.toString());
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

    // 递归更新所有受影响的父文件夹的更新时间
    for (const parentFolderId of affectedParentFolders) {
      await updateParentFoldersTimestamp(parentFolderId);
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

    // 检查权限 - 只有管理员可以创建文件夹
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以创建文件夹' });
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

    // 构建物理路径 - 使用完整的文件夹路径
    const parentFolderPath = await getFolderFullPath(parentFolder._id);
    const folderPath = path.join(STORAGE_PATH, parentFolderPath, folderName);
    // console.log('[SERVER] 创建文件夹路径:', folderPath);

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

    // 递归更新父文件夹的更新时间
    await updateParentFoldersTimestamp(parentFolder._id);

    res.status(201).json({
      message: '文件夹创建成功',
      folder: {
        id: folder._id,
        name: folder.filename,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
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
    const { sort, search } = req.query;
    const query = {};

    // // 普通用户可以看到所有文件，管理员只能看到自己的文件
    // if (req.user.role === 'admin') {
    //   query.owner = req.user.id;
    // }
    // // 普通用户不限制owner，可以看到所有文件

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

    // 搜索功能 - 文件名部分匹配（支持文件夹和文件）
    if (search) {
      const decodedSearch = decodeURIComponent(search);
      query.$or = [
        { originalName: { $regex: decodedSearch, $options: 'i' } },
        { filename: { $regex: decodedSearch, $options: 'i' } }
      ];
      // console.log('收到搜索参数:', decodedSearch, 'MongoDB 查询:', JSON.stringify(query));
    }

    // 排序功能
    let sortOption = { isFolder: -1, filename: 1 }; // 默认文件夹在前，按名称排序
    if (sort) {
      switch (sort) {
        case 'time_asc':
          sortOption = { isFolder: -1, updatedAt: 1 };
          break;
        case 'time_desc':
          sortOption = { isFolder: -1, updatedAt: -1 };
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
          sortOption = { isFolder: -1, filename: 1 };
      }
    }

    const files = await File.find(query)
      .collation({ locale: 'zh' })
      .sort(sortOption)
      .select('filename originalName path size fileType isFolder parentFolder owner createdAt updatedAt');
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 下载文件
// 检查文件状态
const checkFileStatus = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查文件是否存在于文件系统
    if (!file.path || !fs.existsSync(file.path)) {
      return res.status(404).json({ 
        status: 'error',
        message: '文件不存在或已被删除' 
      });
    }

    // 检查文件大小
    const stats = fs.statSync(file.path);
    const fileSize = stats.size;

    // 检查文件是否完整（大小是否匹配）
    if (fileSize !== file.size) {
      return res.status(200).json({ 
        status: 'processing',
        message: '文件正在处理中...',
        currentSize: fileSize,
        expectedSize: file.size
      });
    }

    // 检查文件是否可读
    try {
      const testStream = fs.createReadStream(file.path, { start: 0, end: 0 });
      testStream.on('error', () => {
        return res.status(200).json({ 
          status: 'processing',
          message: '文件正在处理中...'
        });
      });
      testStream.on('data', () => {
        testStream.destroy();
      });
    } catch (error) {
      return res.status(200).json({ 
        status: 'processing',
        message: '文件正在处理中...'
      });
    }

    // 文件状态正常
    return res.status(200).json({ 
      status: 'ready',
      message: '文件已准备就绪',
      size: fileSize
    });

  } catch (error) {
    console.error('检查文件状态错误:', error);
    return res.status(500).json({ 
      status: 'error',
      message: '检查文件状态时发生错误' 
    });
  }
};

const downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查权限 - 所有用户都可以下载所有文件
    // 无需权限检查，所有用户都可以下载任何文件

    if (!file.path || !fs.existsSync(file.path)) {
      return res.status(404).json({ error: '文件不存在或已被删除' });
    }

    // 获取文件信息
    const stats = fs.statSync(file.path);
    const fileSize = stats.size;
    
    // 设置较长的超时时间，特别是对大文件
    if (fileSize > 100 * 1024 * 1024) { // 大于100MB的文件
      req.setTimeout(30 * 60 * 1000); // 30分钟超时
      res.setTimeout(30 * 60 * 1000); // 30分钟超时
    } else {
      req.setTimeout(5 * 60 * 1000); // 5分钟超时
      res.setTimeout(5 * 60 * 1000); // 5分钟超时
    }
    const fileName = file.originalName || file.filename;

    // 设置响应头
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Connection', 'keep-alive');
    // 移除 Transfer-Encoding: chunked，因为我们已经设置了 Content-Length

    // 声明stream变量
    let stream;

    // 支持断点续传
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunksize);

      stream = fs.createReadStream(file.path, { start, end, highWaterMark: 64 * 1024 }); // 64KB chunks
    } else {
      // 普通下载 - 使用更大的缓冲区提高大文件传输效率
      stream = fs.createReadStream(file.path, { highWaterMark: 64 * 1024 }); // 64KB chunks
    }

    // 错误处理
    stream.on('error', (error) => {
      console.error('文件下载错误:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: '文件下载失败' });
      }
    });

    // 添加进度日志（仅对大文件）
    if (fileSize > 100 * 1024 * 1024) { // 大于100MB的文件
      let bytesTransferred = 0;
      stream.on('data', (chunk) => {
        bytesTransferred += chunk.length;
        if (bytesTransferred % (10 * 1024 * 1024) < chunk.length) { // 每10MB记录一次
          const progress = ((bytesTransferred / fileSize) * 100).toFixed(1);
          console.log(`文件下载进度: ${fileName} - ${progress}% (${(bytesTransferred / 1024 / 1024).toFixed(2)}MB / ${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
        }
      });
      
      stream.on('end', () => {
        console.log(`文件下载完成: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
      });
    }

    // 管道传输
    stream.pipe(res);

  } catch (error) {
    console.error('下载文件错误:', error);
    res.status(500).json({ error: error.message });
  }
};

// 递归获取文件夹下的所有文件
const getFolderFiles = async (folderId) => {
  const files = [];
  const folders = [];
  
  const items = await File.find({ parentFolder: folderId });
  
  for (const item of items) {
    if (item.isFolder) {
      folders.push(item);
      const subFiles = await getFolderFiles(item._id);
      files.push(...subFiles);
    } else {
      files.push(item);
    }
  }
  
  return files;
};

// 递归获取文件夹结构
const getFolderStructure = async (folderId) => {
  const folder = await File.findById(folderId);
  if (!folder || !folder.isFolder) {
    throw new Error('文件夹不存在');
  }
  
  const structure = {
    folder: folder,
    files: [],
    subfolders: []
  };
  
  const items = await File.find({ parentFolder: folderId });
  
  for (const item of items) {
    if (item.isFolder) {
      const subStructure = await getFolderStructure(item._id);
      structure.subfolders.push(subStructure);
    } else {
      structure.files.push(item);
    }
  }
  
  return structure;
};

// 上传文件夹处理
const uploadFolder = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '未上传文件' });
    }

    const user = await User.findById(req.user.id);
    
    // 检查权限 - 只有管理员可以上传文件
    if (user.role !== 'admin') {
      // 删除所有上传的文件
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      return res.status(403).json({ error: '只有管理员可以上传文件' });
    }

    const folderId = req.body.folderId;
    const folderName = req.body.folderName;
    
    if (!folderName) {
      return res.status(400).json({ error: '文件夹名称不能为空' });
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
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
        return res.status(500).json({ error: 'Home目录不存在，系统配置错误' });
      }
    } else {
      targetFolder = await File.findOne({ _id: folderId, isFolder: true });
      if (!targetFolder) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
        return res.status(404).json({ error: '目标文件夹不存在' });
      }
    }

    // 创建文件夹记录
    const newFolder = new File({
      filename: folderName,
      path: path.join(STORAGE_PATH, folderName), // 这个path字段在数据库中，保持简单
      size: 0,
      owner: req.user.id,
      isFolder: true,
      originalName: folderName,
      parentFolder: targetFolder._id
    });

    await newFolder.save();

    // 获取目标文件夹的完整路径
    const targetFolderPath = await getFolderFullPath(targetFolder._id);
    const folderPath = path.join(STORAGE_PATH, targetFolderPath, folderName);
    // console.log("[DEBUG] folderPath local:", folderPath);
    fs.mkdirSync(folderPath, { recursive: true });

    let totalSize = 0;
    const uploadedFiles = [];
    const totalFiles = req.files.length;
    let processedFiles = 0;

    // 处理每个上传的文件，保持文件夹结构
    for (const file of req.files) {
      try {
        // 从文件名中提取路径信息
        const encodedFileName = file.originalname;
        const lastUnderscoreIndex = encodedFileName.lastIndexOf('_');
        const originalFileName = encodedFileName.substring(lastUnderscoreIndex + 1);
        const pathPrefix = encodedFileName.substring(0, lastUnderscoreIndex);
        const relativePath = FixEncoding(pathPrefix.replace(/_/g, '/') + '/' + originalFileName);
        // const relativePath = FixEncoding(pathPrefix.replace(/_/g, '/') );
        
        // console.log("[DEBUG] file.originalname (full path):", relativePath);
        
        // 检查路径是否以文件夹名称开头
        if (!relativePath.startsWith(folderName + '/')) {
          // console.log("[DEBUG] 跳过不匹配的文件:", relativePath);
          continue;
        }
        
        // 移除文件夹名称前缀，获取文件在文件夹内的相对路径
        const fileRelativePath = relativePath.substring(folderName.length + 1);
        // console.log("[DEBUG] fileRelativePath:", fileRelativePath);
        
        if (!fileRelativePath) {
          // console.log("[DEBUG] 跳过空路径文件");
          continue;
        }
        
        const fileName = path.basename(fileRelativePath);
        
        // 构建完整的文件路径 - 使用完整的文件夹路径
        const filePath = path.join(folderPath, fileRelativePath);
        
        // 确保目录存在
        const fileDir = path.dirname(filePath);
        fs.mkdirSync(fileDir, { recursive: true });
        
        // 移动文件到目标位置
        // console.log("[DEBUG] filePath:", filePath);
        // console.log("[DEBUG] file.path (temp):", file.path);
        fs.renameSync(file.path, filePath);
        
        // 递归创建文件夹结构并找到正确的父文件夹
        let currentParentFolder = newFolder._id;
        const folderPathParts = path.dirname(fileRelativePath).split('/').filter(part => part.length > 0);
        
        // 为每个子文件夹创建记录
        // 不包括最后一级，因为最后一级是文件名
        for (let i = 0; i < folderPathParts.length-1; i++) {
          const subFolderName = folderPathParts[i];
          
          // 检查子文件夹是否已存在
          let subFolder = await File.findOne({
            filename: subFolderName,
            parentFolder: currentParentFolder,
            isFolder: true
          });
          
          if (!subFolder) {
            // 创建子文件夹记录
            const subFolderPath = path.join(folderPath, folderPathParts.slice(0, i + 1).join('/'));
            subFolder = new File({
              filename: subFolderName,
              path: subFolderPath,
              size: 0,
              owner: req.user.id,
              isFolder: true,
              originalName: subFolderName,
              parentFolder: currentParentFolder
            });
            await subFolder.save();
            // console.log("[DEBUG] 创建子文件夹:", subFolderName, "路径:", subFolderPath);
          }
          
          currentParentFolder = subFolder._id;
        }
        
        // 创建文件记录
        const fileRecord = new File({
          filename: fileName,
          path: filePath,
          size: file.size,
          owner: req.user.id,
          fileType: 'regular',
          originalName: fileName,
          parentFolder: currentParentFolder
        });

        await fileRecord.save();
        totalSize += file.size;
        uploadedFiles.push({
          id: fileRecord._id,
          filename: fileRecord.filename,
          originalName: fileRecord.originalName,
          size: fileRecord.size,
          path: fileRelativePath
        });
        
        // 更新处理进度
        processedFiles++;
        console.log(`归档进度: ${Math.round((processedFiles / totalFiles) * 100)}% - 已处理 ${processedFiles}/${totalFiles} 个文件`);
        
        // console.log("[DEBUG] 创建文件记录:", fileName, "在文件夹:", currentParentFolder);

      } catch (error) {
        console.error('处理文件失败:', file.originalname, error);
        // 删除已上传的文件
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    // 递归更新所有相关文件夹的大小
    const updateFolderSizes = async (folderId) => {
      const folder = await File.findById(folderId);
      if (!folder) return 0;
      
      // 获取所有子文件和子文件夹
      const children = await File.find({ parentFolder: folderId });
      let totalSize = 0;
      
      for (const child of children) {
        if (child.isFolder) {
          totalSize += await updateFolderSizes(child._id);
        } else {
          totalSize += child.size;
        }
      }
      
      // 更新当前文件夹大小
      folder.size = totalSize;
      await folder.save();
      
      return totalSize;
    };
    
    // 更新根文件夹大小
    await updateFolderSizes(newFolder._id);

    // 更新用户存储使用情况
    user.usedStorage += totalSize;
    await user.save();

    // 递归更新父文件夹的更新时间
    await updateParentFoldersTimestamp(targetFolder._id);

    res.status(201).json({
      message: '文件夹上传成功',
      folder: {
        id: newFolder._id,
        name: newFolder.filename,
        size: newFolder.size,
        fileCount: uploadedFiles.length
      },
      files: uploadedFiles
    });

  } catch (error) {
    console.error('上传文件夹错误:', error);
    
    // 清理已上传的文件
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    res.status(500).json({ 
      error: '文件夹上传失败',
      details: error.message 
    });
  }
};

// 获取归档进度
const getArchivingProgress = async (req, res) => {
  try {
    const { folderName } = req.query;
    
    if (!folderName) {
      return res.status(400).json({ error: '缺少文件夹名称参数' });
    }
    
    // 这里可以根据实际需求实现进度跟踪
    // 目前返回模拟进度
    const progress = Math.floor(Math.random() * 100);
    
    res.json({
      folderName,
      progress,
      status: progress >= 100 ? 'completed' : 'processing'
    });
  } catch (error) {
    console.error('获取归档进度错误:', error);
    res.status(500).json({ error: error.message });
  }
};

// 检查文件夹下载状态
const checkFolderDownloadStatus = async (req, res) => {
  try {
    const folderId = req.params.id;
    const folder = await File.findById(folderId);
    
    if (!folder || !folder.isFolder) {
      return res.status(404).json({ error: '文件夹不存在' });
    }
    
    // 获取文件夹结构
    const folderStructure = await getFolderStructure(folderId);
    
    // 计算文件统计信息
    let totalFiles = 0;
    let totalSize = 0;
    
    const calculateTotals = (structure) => {
      for (const file of structure.files) {
        if (file.path && fs.existsSync(file.path)) {
          totalFiles++;
          totalSize += file.size || 0;
        }
      }
      for (const subfolder of structure.subfolders) {
        calculateTotals(subfolder);
      }
    };
    
    calculateTotals(folderStructure);
    
    res.json({
      folderName: folder.originalName || folder.filename,
      totalFiles,
      totalSize,
      estimatedZipSize: Math.round(totalSize * 0.8), // 估算ZIP大小（压缩后约为原大小的80%）
      readyForDownload: true
    });
    
  } catch (error) {
    console.error('检查文件夹下载状态错误:', error);
    res.status(500).json({ error: error.message });
  }
};

const downloadFolder = async (req, res) => {
  try {
    const folderId = req.params.id;
    const folder = await File.findById(folderId);
    
    if (!folder || !folder.isFolder) {
      return res.status(404).json({ error: '文件夹不存在' });
    }
    
    // 检查权限 - 所有用户都可以下载所有文件夹
    // 无需权限检查，所有用户都可以下载任何文件夹
    
    // 获取文件夹结构
    const folderStructure = await getFolderStructure(folderId);
    
    // 创建临时目录
    const tempDir = path.join(__dirname, '../../storage/temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const zipFileName = `${folder.originalName || folder.filename}_${Date.now()}.zip`;
    const zipFilePath = path.join(tempDir, zipFileName);
    
    // 创建ZIP文件
    const archiver = require('archiver');
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: 6 } // 降低压缩级别以提高速度
    });
    
    // 进度跟踪变量
    let totalFiles = 0;
    let processedFiles = 0;
    let totalSize = 0;
    let processedSize = 0;
    
    // 计算总文件数和大小
    const calculateTotals = (structure) => {
      for (const file of structure.files) {
        if (file.path && fs.existsSync(file.path)) {
          totalFiles++;
          totalSize += file.size || 0;
        }
      }
      for (const subfolder of structure.subfolders) {
        calculateTotals(subfolder);
      }
    };
    
    calculateTotals(folderStructure);
    console.log(`开始创建ZIP文件，总计 ${totalFiles} 个文件，${(totalSize / 1024 / 1024).toFixed(2)}MB`);
    
    // 监听ZIP创建完成
    const zipPromise = new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`ZIP文件创建完成: ${zipFileName} (${archive.pointer()} bytes)`);
        resolve();
      });
      
      archive.on('error', (err) => {
        console.error('ZIP创建错误:', err);
        reject(err);
      });
      
      // 监听文件添加进度
      archive.on('entry', (entry) => {
        processedFiles++;
        const progress = Math.round((processedFiles / totalFiles) * 100);
        console.log(`ZIP创建进度: ${progress}% (${processedFiles}/${totalFiles} 文件) - ${entry.name}`);
      });
    });
    
    archive.pipe(output);
    
    // 递归添加文件到ZIP
    const addFilesToZip = async (structure, basePath = '') => {
      // 添加当前文件夹中的文件
      for (const file of structure.files) {
        if (file.path && fs.existsSync(file.path)) {
          const filePath = path.join(basePath, file.originalName || file.filename);
          const fixedFilePath = FixEncoding(filePath);
          archive.file(file.path, { name: fixedFilePath });
          console.log(`添加文件到ZIP: ${fixedFilePath}`);
        }
      }
      
      // 递归处理子文件夹
      for (const subfolder of structure.subfolders) {
        const subfolderPath = path.join(basePath, subfolder.folder.originalName || subfolder.folder.filename);
        
        // 为每个子文件夹添加一个目录条目（即使文件夹为空）
        const fixedSubfolderPath = FixEncoding(subfolderPath);
        archive.append('', { name: fixedSubfolderPath + '/' });
        console.log(`添加空文件夹到ZIP: ${fixedSubfolderPath}/`);
        
        // 递归处理子文件夹的内容
        await addFilesToZip(subfolder, subfolderPath);
      }
    };
    
    // 开始添加文件
    await addFilesToZip(folderStructure);
    
    // 完成ZIP文件
    await archive.finalize();
    await zipPromise;
    
    // 检查ZIP文件是否创建成功
    if (!fs.existsSync(zipFilePath)) {
      return res.status(500).json({ error: 'ZIP文件创建失败' });
    }
    
    const stats = fs.statSync(zipFilePath);
    const fileSize = stats.size;
    
    console.log(`ZIP文件准备就绪: ${zipFileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipFileName)}`);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'no-cache');
    
    // 创建文件流并发送，添加传输进度跟踪
    const fileStream = fs.createReadStream(zipFilePath);
    let bytesSent = 0;
    const startTime = Date.now();
    
    fileStream.on('data', (chunk) => {
      bytesSent += chunk.length;
      const transferProgress = Math.round((bytesSent / fileSize) * 100);
      let lastPrintedProgress = 0;
      const elapsed = (Date.now() - startTime) / 1000;
      const speed = bytesSent / elapsed / 1024 / 1024; // MB/s
      //每10%打印一次  并且不重复打印之前打印过的
      if (transferProgress % 10 === 0 && transferProgress > lastPrintedProgress) {
        lastPrintedProgress = transferProgress;
        console.log(`文件传输进度: ${transferProgress}% (${(bytesSent / 1024 / 1024).toFixed(2)}MB / ${(fileSize / 1024 / 1024).toFixed(2)}MB) - 速度: ${speed.toFixed(2)}MB/s`);
      }
    });
    
    fileStream.on('error', (error) => {
      console.error('ZIP文件下载错误:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'ZIP文件下载失败' });
      }
    });
    
    fileStream.on('end', () => {
      const totalTime = (Date.now() - startTime) / 1000;
      console.log(`ZIP文件传输完成: ${zipFileName} - 总耗时: ${totalTime.toFixed(2)}秒`);
      // 下载完成后删除临时文件
      fs.unlink(zipFilePath, (err) => {
        if (err) {
          console.error('删除临时ZIP文件失败:', err);
        } else {
          console.log(`临时ZIP文件已删除: ${zipFileName}`);
        }
      });
    });
    
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('下载文件夹错误:', error);
    res.status(500).json({ error: error.message });
  }
};



// 导出所有控制器函数
const uploadFile = async (req, res) => {
  try {
    // console.log('[SERVER] 收到普通文件上传请求');
    const result = await processFileUpload(req, res, 'regular');
    // console.log('[SERVER] 上传处理完成，发送成功响应');
    res.status(200).json(result);
  } catch (error) {
    // console.log('[SERVER] 普通文件上传失败:', error.message);
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
  uploadFolder,
  getUserFiles,
  downloadFile,
  downloadFolder,
  deleteFile,
  deleteAllFiles,
  batchDeleteFiles,
  createFolder,
  checkFileStatus,
  checkFolderDownloadStatus,
  getArchivingProgress
};