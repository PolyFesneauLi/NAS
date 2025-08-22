const File = require('../models/File');
const User = require('../models/User');
const Tag = require('../models/Tag');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const storageAccess = require('../utils/storageAccess');
const { ensureRootFolder } = require('../utils/initRootFolder');

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
    filePath = storageAccess.getStoragePath(path.join('uploads', folderFullPath, fileName));
    console.log('[SERVER] 文件最终路径:', filePath);
    
    // 确保目录存在
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.renameSync(req.file.path, filePath);

    // 创建文件记录
    const originalName = decodeURIComponent(req.file.originalname);
    const filename = path.basename(filePath);
    
    // 确保文件名不为空
    if (!filename || filename === '') {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: '文件名不能为空' });
    }
    
    // 检查是否有重复项目
    const existingItems = await File.find({
      parentFolder: targetFolder._id
    });
    
    for (const existingItem of existingItems) {
      const existingOriginalName = existingItem.originalName || existingItem.filename;
      const decodedExistingName = FixEncoding(existingOriginalName);
      
      if (decodedExistingName === originalName) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: `项目 "${originalName}" 已存在，请重命名后重新上传` });
      }
    }
    
    const file = new File({
      filename: filename,
      path: filePath,
      size: fileSize,
      owner: req.user.id,
      fileType,
      originalName: originalName,
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
      // 子文件夹的数据库记录已经在recursiveDelete中删除
    } else {
      // 删除文件前，先更新标签的usageCount
      if (child.tags && child.tags.length > 0) {
        for (const tag of child.tags) {
          try {
            const tagDoc = await Tag.findOne({ name: tag.name });
            if (tagDoc && tagDoc.usageCount > 0) {
              tagDoc.usageCount -= 1;
              await tagDoc.save();
              console.log(`[RECURSIVE_DELETE] 更新标签 "${tag.name}" 的usageCount: ${tagDoc.usageCount + 1} -> ${tagDoc.usageCount}`);
            }
          } catch (tagUpdateError) {
            console.error(`[RECURSIVE_DELETE] 更新标签 "${tag.name}" 的usageCount失败:`, tagUpdateError);
          }
        }
      }

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
      // 删除单个文件前，先更新标签的usageCount
      if (file.tags && file.tags.length > 0) {
        for (const tag of file.tags) {
          try {
            const tagDoc = await Tag.findOne({ name: tag.name });
            if (tagDoc && tagDoc.usageCount > 0) {
              tagDoc.usageCount -= 1;
              await tagDoc.save();
              console.log(`[DELETE_FILE] 更新标签 "${tag.name}" 的usageCount: ${tagDoc.usageCount + 1} -> ${tagDoc.usageCount}`);
            }
          } catch (tagUpdateError) {
            console.error(`[DELETE_FILE] 更新标签 "${tag.name}" 的usageCount失败:`, tagUpdateError);
          }
        }
      }

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
      // 删除物理文件前，先更新标签的usageCount
      if (file.tags && file.tags.length > 0) {
        for (const tag of file.tags) {
          try {
            const tagDoc = await Tag.findOne({ name: tag.name });
            if (tagDoc && tagDoc.usageCount > 0) {
              tagDoc.usageCount -= 1;
              await tagDoc.save();
              console.log(`[DELETE_ALL_FILES] 更新标签 "${tag.name}" 的usageCount: ${tagDoc.usageCount + 1} -> ${tagDoc.usageCount}`);
            }
          } catch (tagUpdateError) {
            console.error(`[DELETE_ALL_FILES] 更新标签 "${tag.name}" 的usageCount失败:`, tagUpdateError);
          }
        }
      }

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
        // 删除单个文件前，先更新标签的usageCount
        if (file.tags && file.tags.length > 0) {
          for (const tag of file.tags) {
            try {
              const tagDoc = await Tag.findOne({ name: tag.name });
              if (tagDoc && tagDoc.usageCount > 0) {
                tagDoc.usageCount -= 1;
                await tagDoc.save();
                console.log(`[BATCH_DELETE] 更新标签 "${tag.name}" 的usageCount: ${tagDoc.usageCount + 1} -> ${tagDoc.usageCount}`);
              }
            } catch (tagUpdateError) {
              console.error(`[BATCH_DELETE] 更新标签 "${tag.name}" 的usageCount失败:`, tagUpdateError);
            }
          }
        }

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
    const folderPath = storageAccess.getStoragePath(path.join('uploads', parentFolderPath, folderName));
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

// 从url的信息 搜索文件
const searchFiles = async (req, res) => {
  try {
    const folderId = req.query.folder;
    const { sort, search, tags, globalSearch } = req.query;
    const query = {};

    // 全局搜索时，搜索当前路径及其所有子文件夹
    if (globalSearch === 'true') {
      // 全局搜索：搜索当前路径及其所有子文件夹中的文件
      // 我们需要获取所有在当前路径及其子文件夹中的文件
      // 首先获取当前路径下的所有文件夹ID
      const getSubfolderIds = async (parentId) => {
        const subfolders = await File.find({ 
          parentFolder: parentId, 
          isFolder: true 
        });
        let allIds = [parentId];
        for (const subfolder of subfolders) {
          const subIds = await getSubfolderIds(subfolder._id);
          allIds = allIds.concat(subIds);
        }
        return allIds;
      };

      let targetFolderId;
      if (folderId) {
        targetFolderId = folderId;
      } else {
        const homeFolder = await File.findOne({ 
          isFolder: true, 
          parentFolder: null,
          filename: "home"
        });
        if (!homeFolder) {
          return res.status(500).json({ error: 'Home目录不存在，系统配置错误' });
        }
        targetFolderId = homeFolder._id;
      }

      // 获取所有子文件夹ID
      const allFolderIds = await getSubfolderIds(targetFolderId);
      
      // 查询所有在这些文件夹中的文件
      query.parentFolder = { $in: allFolderIds };
    } else {
      // 普通搜索：只搜索当前文件夹
      if (folderId) {
        query.parentFolder = folderId;
      } else {
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
    }

    // 搜索功能 - 文件名部分匹配（支持文件夹和文件）
    if (search) {
      const decodedSearch = FixEncoding(decodeURIComponent(search));
      query.$or = [
        { originalName: { $regex: decodedSearch, $options: 'i' } },
        { filename: { $regex: decodedSearch, $options: 'i' } }
      ];
      // console.log('收到搜索参数:', decodedSearch, 'MongoDB 查询:', JSON.stringify(query));
    }

    // 标签搜索功能
    if (tags) {
      try {
        const tagArray = JSON.parse(decodeURIComponent(tags));
        if (Array.isArray(tagArray) && tagArray.length > 0) {
          // 对每个标签应用编码修复
          const fixedTagArray = tagArray.map(tag => FixEncoding(tag));
          // 查找包含所有指定标签的文件
          query['tags.name'] = { $all: fixedTagArray };
        }
      } catch (error) {
        console.error('解析标签参数错误:', error);
      }
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
      .select('filename originalName path size fileType isFolder parentFolder owner createdAt updatedAt tags');
    
    // 获取按 order 排序的标签列表
    const sortedTags = await Tag.find()
      .sort({ order: 1, usageCount: -1, name: 1 })
      .select('name color usageCount createdAt order createdBy');
    
    // 为每个文件添加排序后的标签信息
    const filesWithSortedTags = files.map(file => {
      const fileObj = file.toObject();
      fileObj.sortedTags = sortedTags;
      return fileObj;
    });
    
    res.json({ files: filesWithSortedTags });
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

    // 获取目标文件夹的完整路径
    const targetFolderPath = await getFolderFullPath(targetFolder._id);
    const folderPath = storageAccess.getStoragePath(path.join('uploads', targetFolderPath, folderName));
    
    // 确保文件夹名称不为空
    if (!folderName || folderName.trim() === '') {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
      return res.status(400).json({ error: '文件夹名称不能为空' });
    }
    
    // 检查是否有重复项目
    const existingItems = await File.find({
      parentFolder: targetFolder._id
    });
    
    for (const existingItem of existingItems) {
      const existingOriginalName = existingItem.originalName || existingItem.filename;
      const decodedExistingName = FixEncoding(existingOriginalName);
      
      if (decodedExistingName === folderName) {
        req.files.forEach(file => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
        return res.status(400).json({ error: `项目 "${folderName}" 已存在，请重命名后重新上传` });
      }
    }
    
    // 创建文件夹记录 - 使用完整的物理路径
    const newFolder = new File({
      filename: folderName,
      path: folderPath, // 使用完整的物理路径，确保删除时能找到正确位置
      size: 0,
      owner: req.user.id,
      isFolder: true,
      originalName: folderName,
      parentFolder: targetFolder._id
    });

    await newFolder.save();

    // 创建物理文件夹
    fs.mkdirSync(folderPath, { recursive: true });

    let totalSize = 0;
    const uploadedFiles = [];
    const totalFiles = req.files.length;
    let processedFiles = 0;

    // 处理每个上传的文件，保持文件夹结构
    for (const file of req.files) {
      try {
        // 约定：客户端将整个 webkitRelativePath 中的分隔符 '/' 替换为 '___'
        // 因此这里直接用 '___' 还原完整相对路径（包含文件名）
        const encodedFileName = file.originalname;
        const relativePath = FixEncoding(encodedFileName.replace(/___/g, '/'));
        
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
          
          // 检查子文件夹名称是否为空
          if (!subFolderName || subFolderName.trim() === '') {
            console.error('子文件夹名称为空，跳过:', file.originalname);
            continue;
          }
          
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
        
        // 确保文件名不为空
        if (!fileName || fileName === '') {
          console.error('文件名为空，跳过文件:', file.originalname);
          continue;
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
        // console.log(`归档进度: ${Math.round((processedFiles / totalFiles) * 100)}% - 已处理 ${processedFiles}/${totalFiles} 个文件`);
        
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
    const tempDir = storageAccess.getStoragePath('temp');
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

// 添加标签到文件/文件夹
const addTags = async (req, res) => {
  try {
    const { fileId, tags } = req.body;
    
    if (!fileId || !tags || !Array.isArray(tags)) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const user = await User.findById(req.user.id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以添加标签' });
    }

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 验证标签格式
    const validTags = tags.filter(tag => 
      tag.name && tag.name.trim() && tag.color && tag.color.trim()
    );

    if (validTags.length === 0) {
      return res.status(400).json({ error: '没有有效的标签' });
    }

    // 添加新标签到文件，避免重复
    const newTagsToAdd = [];
    const tagsToAddToFile = [];
    validTags.forEach(newTag => {
      const existingTag = file.tags.find(tag => tag.name === newTag.name);
      if (!existingTag) {
        tagsToAddToFile.push(newTag);
        newTagsToAdd.push(newTag);
      }
    });

    // 更新标签顺序数组
    if (tagsToAddToFile.length > 0) {
      if (!file.tagOrder) {
        file.tagOrder = [];
      }
      // 将新标签添加到顺序数组的末尾
      tagsToAddToFile.forEach(tag => {
        if (!file.tagOrder.includes(tag.name)) {
          file.tagOrder.push(tag.name);
        }
      });
      
      // 确保所有现有标签都在顺序数组中
      file.tags.forEach(tag => {
        if (!file.tagOrder.includes(tag.name)) {
          file.tagOrder.push(tag.name);
        }
      });
    }

    // 同时更新 Tag 模型 - admin可以管理所有标签，不限制createdBy
    const successfullyProcessedTags = [];
    for (const tag of newTagsToAdd) {
      let tagDoc = await Tag.findOne({ name: tag.name });
      if (!tagDoc) {
        // 标签不存在，需要创建新标签
        try {
          // 找到使用次数为0且order最高的标签
          const maxOrderUnusedTag = await Tag.findOne({ usageCount: 0 })
            .sort({ order: -1 })
            .select('order');
          
          let newOrder;
          if (maxOrderUnusedTag) {
            // 插入到使用次数为0且order最高的标签之前
            newOrder = Math.max(0, maxOrderUnusedTag.order - 1);
            
            // 将order >= newOrder的标签order值都+1，为新标签腾出位置
            await Tag.updateMany(
              { order: { $gte: newOrder } },
              { $inc: { order: 1 } }
            );
          } else {
            // 如果没有使用次数为0的标签，则放在最后
            const maxOrderTag = await Tag.findOne()
              .sort({ order: -1 })
              .select('order');
            
            newOrder = maxOrderTag ? maxOrderTag.order + 1 : 0;
          }
          
          // 创建新标签，createdBy设置为当前admin用户
          tagDoc = new Tag({
            name: tag.name,
            color: tag.color,
            createdBy: user._id,
            usageCount: 1,
            order: newOrder
          });
          
          await tagDoc.save();
          // 使用新创建的标签信息（包括可能生成的_id等）
          successfullyProcessedTags.push({
            name: tagDoc.name,
            color: tagDoc.color,
            _id: tagDoc._id
          });
        } catch (error) {
          // 如果创建标签失败（比如名称重复），则跳过这个标签
          console.warn(`创建标签 "${tag.name}" 失败:`, error.message);
          continue;
        }
      } else {
        // 标签已存在，增加使用次数，并使用全局标签的属性
        tagDoc.usageCount += 1;
        await tagDoc.save();
        // 使用全局标签的属性（颜色、ID等），而不是用户输入的可能不同的属性
        successfullyProcessedTags.push({
          name: tagDoc.name,
          color: tagDoc.color,
          _id: tagDoc._id
        });
      }
    }
    
    // 只将成功处理的标签添加到文件中
    file.tags.push(...successfullyProcessedTags);

    await file.save();
    
    res.json({ 
      success: true, 
      message: '标签添加成功',
      tags: file.tags 
    });
  } catch (error) {
    console.error('添加标签错误:', error);
    res.status(500).json({ error: error.message });
  }
};

// 移除文件/文件夹的标签
const removeTags = async (req, res) => {
  try {
    const { fileId, tagNames } = req.body;
    
    if (!fileId || !tagNames || !Array.isArray(tagNames)) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const user = await User.findById(req.user.id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以移除标签' });
    }

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 移除指定的标签
    file.tags = file.tags.filter(tag => !tagNames.includes(tag.name));
    
    // 更新标签顺序数组
    if (file.tagOrder) {
      file.tagOrder = file.tagOrder.filter(tagName => !tagNames.includes(tagName));
    }
    
    // 更新 Tag 模型的使用次数 - admin可以管理所有标签
    for (const tagName of tagNames) {
      const tagDoc = await Tag.findOne({ name: tagName });
      if (tagDoc && tagDoc.usageCount > 0) {
        tagDoc.usageCount -= 1;
        await tagDoc.save();
      }
    }
    
    await file.save();
    
    res.json({ 
      success: true, 
      message: '标签移除成功',
      tags: file.tags 
    });
  } catch (error) {
    console.error('移除标签错误:', error);
    res.status(500).json({ error: error.message });
  }
};

// 创建新标签
const createTag = async (req, res) => {
  try {
    const { name, color } = req.body;
    
    if (!name || !name.trim() || !color || !color.trim()) {
      return res.status(400).json({ error: '标签名称和颜色不能为空' });
    }

    const user = await User.findById(req.user.id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以创建标签' });
    }

    // 检查标签是否已存在（全局检查，不限制createdBy）
    const existingTag = await Tag.findOne({ name: name.trim() });
    if (existingTag) {
      return res.status(400).json({ error: '标签已存在' });
    }

    // 找到使用次数为0且order最高的标签
    const maxOrderUnusedTag = await Tag.findOne({ usageCount: 0 })
      .sort({ order: -1 })
      .select('order');
    
    let newOrder;
    if (maxOrderUnusedTag) {
      // 插入到使用次数为0且order最高的标签之前
      newOrder = Math.max(0, maxOrderUnusedTag.order - 1);
      
      // 将order >= newOrder的标签order值都+1，为新标签腾出位置
      await Tag.updateMany(
        { order: { $gte: newOrder } },
        { $inc: { order: 1 } }
      );
    } else {
      // 如果没有使用次数为0的标签，则放在最后
      const maxOrderTag = await Tag.findOne()
        .sort({ order: -1 })
        .select('order');
      
      newOrder = maxOrderTag ? maxOrderTag.order + 1 : 0;
    }
    
    // 创建新标签
    const newTag = new Tag({
      name: name.trim(),
      color: color.trim(),
      createdBy: user._id,
      usageCount: 0,
      order: newOrder
    });

    await newTag.save();
    
    res.json({ 
      success: true, 
      message: '标签创建成功',
      tag: newTag 
    });
  } catch (error) {
    console.error('创建标签错误:', error);
    res.status(500).json({ error: error.message });
  }
};

// 获取所有标签（用于标签选择器和热门标签）
const getAllTags = async (req, res) => {
  try {
    // 获取所有标签，而不仅仅是当前用户创建的标签
    // 这样热门标签对所有用户都可见
    const tags = await Tag.find()
      .sort({ order: 1, usageCount: -1, name: 1 })
      .select('name color usageCount createdAt order createdBy');
    
    res.json({ tags });
  } catch (error) {
    console.error('获取标签错误:', error);
    res.status(500).json({ error: error.message });
  }
};

// 获取单个文件详情
const getFileDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(req.user.id);
    
    const file = await File.findById(id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 所有认证用户都可以获取文件详情，用于跳转功能
    // 不再检查文件所有者权限

    // 获取按 order 排序的标签列表
    const sortedTags = await Tag.find()
      .sort({ order: 1, usageCount: -1, name: 1 })
      .select('name color usageCount createdAt order createdBy');

    // 将排序后的标签信息添加到文件对象中
    const fileWithSortedTags = file.toObject();
    fileWithSortedTags.sortedTags = sortedTags;

    res.json(fileWithSortedTags);
  } catch (error) {
    console.error('获取文件详情错误:', error);
    res.status(500).json({ error: error.message });
  }
};

// 更新文件标签顺序，或全局热门标签顺序（当 fileId === 'global' 或 global === true 时）
const updateTagOrder = async (req, res) => {
  try {
    const { fileId, tagOrder, global } = req.body;
    if (!tagOrder || !Array.isArray(tagOrder)) {
      return res.status(400).json({ error: '缺少必要参数: tagOrder' });
    }

    const user = await User.findById(req.user.id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以更新标签顺序' });
    }

    // 全局热门标签排序：允许通过同一接口更新 Tag.order
    if (fileId === 'global' || global === true || !fileId) {
      // 全局：将提交的前 N 个标签固定为最小的顺序值 [0..N-1]，
      // 其他标签按原有顺序（order/usageCount）从 N 开始顺延，确保"热门前10"能稳定生效
      const allTags = await Tag.find().sort({ order: 1, usageCount: -1, name: 1 }).select('name order');
      const desiredSet = new Set(tagOrder);

      // 先更新指定的标签顺序到 [0..N-1]
      for (let i = 0; i < tagOrder.length; i++) {
        const tagName = tagOrder[i];
        await Tag.updateMany(
          { name: tagName },
          { $set: { order: i }, $currentDate: { updatedAt: true } }
        );
      }

      // 其他标签顺延：保持原相对顺序，从 tagOrder.length 开始递增
      let cursor = tagOrder.length;
      for (const t of allTags) {
        if (desiredSet.has(t.name)) continue;
        await Tag.updateMany(
          { name: t.name },
          { $set: { order: cursor++ }, $currentDate: { updatedAt: true } }
        );
      }

      return res.json({
        success: true,
        message: '全局标签顺序更新成功',
        tagOrder
      });
    }

    // 文件层面的标签排序
    if (!fileId) {
      return res.status(400).json({ error: '缺少必要参数: fileId' });
    }

    // 使用findOneAndUpdate避免版本冲突
    const file = await File.findOneAndUpdate(
      { _id: fileId },
      { 
        $set: { tagOrder: tagOrder },
        $currentDate: { updatedAt: true }
      },
      { 
        new: true,
        runValidators: true
      }
    );

    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 验证标签顺序数组是否与当前标签匹配
    const currentTagNames = file.tags.map(tag => tag.name);
    const isValidOrder = tagOrder.every(tagName => currentTagNames.includes(tagName)) &&
                        currentTagNames.every(tagName => tagOrder.includes(tagName));

    if (!isValidOrder) {
      return res.status(400).json({ error: '标签顺序数组与当前标签不匹配' });
    }

    // 同时更新全局标签顺序（如果标签是全局的）
    for (let i = 0; i < tagOrder.length; i++) {
      const tagName = tagOrder[i];
      await Tag.findOneAndUpdate(
        { name: tagName, createdBy: user._id },
        { order: i },
        { new: true }
      );
    }

    res.json({ 
      success: true, 
      message: '标签顺序更新成功',
      tagOrder: file.tagOrder 
    });
  } catch (error) {
    console.error('更新标签顺序错误:', error);
    res.status(500).json({ error: error.message });
  }
};

// 重命名文件
const renameFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { newFilename } = req.body;

    if (!newFilename || newFilename.trim() === '') {
      return res.status(400).json({ error: '新文件名不能为空' });
    }

    const user = await User.findById(req.user.id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以重命名文件' });
    }

    // 查找文件
    const file = await File.findById(id);
    if (!file) {
      return res.status(404).json({ error: '文件不存在' });
    }

    // 检查新文件名是否已存在
    const existingFile = await File.findOne({
      filename: newFilename,
      parentFolder: file.parentFolder,
      _id: { $ne: id }
    });

    if (existingFile) {
      return res.status(400).json({ error: '文件名已存在' });
    }

    // 构建旧文件路径和新文件路径
    const oldFilePath = file.path ? file.path : storageAccess.getStoragePath(path.join('uploads', file.filename));
    const newFilePath = file.path ? 
      path.join(path.dirname(file.path), newFilename) : 
      storageAccess.getStoragePath(path.join('uploads', newFilename));

    // 检查旧文件是否存在
    if (!fs.existsSync(oldFilePath)) {
      return res.status(404).json({ error: '文件在存储中不存在' });
    }

    // 重命名文件或文件夹
    fs.renameSync(oldFilePath, newFilePath);

    // 更新数据库中的文件名和路径
    file.filename = newFilename;
    file.originalName = newFilename;
    if (file.path) {
      file.path = path.join(path.dirname(file.path), newFilename);
    }
    file.updatedAt = new Date();
    await file.save();

    // 如果文件在文件夹中，更新父文件夹的时间戳
    if (file.parentFolder) {
      await updateParentFoldersTimestamp(file.parentFolder);
    }

    console.log(`文件重命名成功: ${file.filename} -> ${newFilename}`);

    res.json({
      success: true,
      message: '文件重命名成功',
      file: {
        _id: file._id,
        filename: file.filename,
        originalName: file.originalName,
        updatedAt: file.updatedAt
      }
    });

  } catch (error) {
    console.error('重命名文件错误:', error);
    res.status(500).json({ error: error.message });
  }
};

const getUserFiles = async (req, res) => {
  try {
    // 确保根目录存在
    try {
      await ensureRootFolder();
    } catch (error) {
      console.error('Failed to ensure root folder:', error);
      return res.status(500).json({ error: '系统初始化失败，请联系管理员' });
    }

    const folderId = req.query.folder;
    const { sort, search, tags, globalSearch } = req.query;
    const query = {};

    // 全局搜索时，搜索当前路径及其所有子文件夹
    if (globalSearch === 'true') {
      // 全局搜索：搜索当前路径及其所有子文件夹中的文件
      // 我们需要获取所有在当前路径及其子文件夹中的文件
      // 首先获取当前路径下的所有文件夹ID
      const getSubfolderIds = async (parentId) => {
        const subfolders = await File.find({ 
          parentFolder: parentId, 
          isFolder: true 
        });
        let allIds = [parentId];
        for (const subfolder of subfolders) {
          const subIds = await getSubfolderIds(subfolder._id);
          allIds = allIds.concat(subIds);
        }
        return allIds;
      };

      let targetFolderId;
      if (folderId) {
        targetFolderId = folderId;
      } else {
        const homeFolder = await File.findOne({ 
          isFolder: true, 
          parentFolder: null,
          filename: "home"
        });
        if (!homeFolder) {
          return res.status(500).json({ error: 'Home目录不存在，系统配置错误' });
        }
        targetFolderId = homeFolder._id;
      }

      // 获取所有子文件夹ID
      const allFolderIds = await getSubfolderIds(targetFolderId);
      
      // 查询所有在这些文件夹中的文件
      query.parentFolder = { $in: allFolderIds };
    } else {
      // 普通搜索：只搜索当前文件夹
      if (folderId) {
        query.parentFolder = folderId;
      } else {
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
    }

    // 搜索功能 - 文件名部分匹配（支持文件夹和文件）
    if (search) {
      const decodedSearch = FixEncoding(decodeURIComponent(search));
      query.$or = [
        { originalName: { $regex: decodedSearch, $options: 'i' } },
        { filename: { $regex: decodedSearch, $options: 'i' } }
      ];
      // console.log('收到搜索参数:', decodedSearch, 'MongoDB 查询:', JSON.stringify(query));
    }

    // 标签搜索功能
    if (tags) {
      try {
        const tagArray = JSON.parse(decodeURIComponent(tags));
        if (Array.isArray(tagArray) && tagArray.length > 0) {
          // 对每个标签应用编码修复
          const fixedTagArray = tagArray.map(tag => FixEncoding(tag));
          // 查找包含所有指定标签的文件
          query['tags.name'] = { $all: fixedTagArray };
        }
      } catch (error) {
        console.error('解析标签参数错误:', error);
      }
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
      .select('filename originalName path size fileType isFolder parentFolder owner createdAt updatedAt tags');
    
    // 获取按 order 排序的标签列表
    const sortedTags = await Tag.find()
      .sort({ order: 1, usageCount: -1, name: 1 })
      .select('name color usageCount createdAt order createdBy');
    
    // 为每个文件添加排序后的标签信息
    const filesWithSortedTags = files.map(file => {
      const fileObj = file.toObject();
      fileObj.sortedTags = sortedTags;
      return fileObj;
    });
    
    res.json({ files: filesWithSortedTags });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 删除标签（仅管理员）
const deleteTag = async (req, res) => {
  try {
    const { tagName } = req.body;
    
    if (!tagName || !tagName.trim()) {
      return res.status(400).json({ error: '标签名称不能为空' });
    }

    const user = await User.findById(req.user.id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以删除标签' });
    }

    console.log(`[DELETE_TAG] 开始删除标签: "${tagName}"`);

    // 检查标签是否存在
    const tag = await Tag.findOne({ name: tagName.trim() });
    if (!tag) {
      console.log(`[DELETE_TAG] 标签不存在: "${tagName}"`);
      return res.status(404).json({ error: '标签不存在' });
    }

    console.log(`[DELETE_TAG] 标签信息:`, {
      id: tag._id,
      name: tag.name,
      usageCount: tag.usageCount,
      createdBy: tag.createdBy,
      createdAt: tag.createdAt
    });

    // 检查标签是否正在使用
    if (tag.usageCount > 0) {
      console.log(`[DELETE_TAG] 标签正在使用中，usageCount: ${tag.usageCount}`);
      
      // 尝试查找使用该标签的文件，提供更详细的错误信息
      try {
        const filesWithTag = await File.find({ 'tags.name': tagName.trim() });
        console.log(`[DELETE_TAG] 找到 ${filesWithTag.length} 个文件使用此标签`);
        
        if (filesWithTag.length > 0) {
          const fileDetails = filesWithTag.slice(0, 5).map(file => ({
            id: file._id,
            name: file.originalName || file.filename,
            isFolder: file.isFolder,
            owner: file.owner
          }));
          
          console.log(`[DELETE_TAG] 使用此标签的文件示例:`, fileDetails);
          
          return res.status(400).json({ 
            error: `标签正在使用中，无法删除`,
            details: {
              usageCount: tag.usageCount,
              fileCount: filesWithTag.length,
              sampleFiles: fileDetails,
              message: `该标签被 ${filesWithTag.length} 个文件使用，请先移除所有文件上的此标签后再删除`
            }
          });
        } else {
          // 如果找不到文件但usageCount > 0，可能是数据不一致
          console.log(`[DELETE_TAG] 警告: usageCount > 0 但找不到使用该标签的文件，可能存在数据不一致`);
          return res.status(400).json({ 
            error: `标签数据不一致，无法删除`,
            details: {
              usageCount: tag.usageCount,
              message: `标签使用计数与实际使用情况不一致，请联系管理员检查数据库`
            }
          });
        }
      } catch (fileQueryError) {
        console.error(`[DELETE_TAG] 查询使用该标签的文件时出错:`, fileQueryError);
        return res.status(400).json({ 
          error: `标签正在使用中，无法删除`,
          details: {
            usageCount: tag.usageCount,
            message: `无法验证标签使用情况，请稍后重试或联系管理员`
          }
        });
      }
    }

    // 再次确认标签没有被使用（双重检查）
    try {
      const finalCheck = await File.findOne({ 'tags.name': tagName.trim() });
      if (finalCheck) {
        console.log(`[DELETE_TAG] 最终检查发现标签仍在使用中，文件:`, {
          id: finalCheck._id,
          name: finalCheck.originalName || finalCheck.filename
        });
        return res.status(400).json({ 
          error: `标签仍在使用中，无法删除`,
          details: {
            message: `检测到标签仍被文件使用，请刷新页面后重试`
          }
        });
      }
    } catch (finalCheckError) {
      console.error(`[DELETE_TAG] 最终检查时出错:`, finalCheckError);
      return res.status(500).json({ 
        error: `删除标签时发生错误`,
        details: {
          message: `无法完成最终验证，请稍后重试`
        }
      });
    }

    // 删除标签
    console.log(`[DELETE_TAG] 开始删除标签: ${tag._id}`);
    await Tag.findByIdAndDelete(tag._id);
    console.log(`[DELETE_TAG] 标签删除成功: "${tagName}"`);
    
    res.json({ 
      success: true, 
      message: '标签删除成功',
      details: {
        deletedTag: {
          name: tag.name,
          id: tag._id
        }
      }
    });
  } catch (error) {
    console.error(`[DELETE_TAG] 删除标签时发生错误:`, {
      tagName: req.body?.tagName,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // 根据错误类型返回不同的状态码
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        error: '标签数据验证失败',
        details: error.message
      });
    } else if (error.name === 'CastError') {
      return res.status(400).json({ 
        error: '标签ID格式错误',
        details: error.message
      });
    } else {
      return res.status(500).json({ 
        error: '删除标签时发生服务器错误',
        details: error.message
      });
    }
  }
};

// 强制删除标签（仅管理员，会清理所有使用该标签的文件）
const forceDeleteTag = async (req, res) => {
  try {
    const { tagName, force } = req.body;
    
    if (!tagName || !tagName.trim()) {
      return res.status(400).json({ error: '标签名称不能为空' });
    }

    if (force !== true) {
      return res.status(400).json({ error: '必须设置 force=true 才能强制删除标签' });
    }

    const user = await User.findById(req.user.id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以强制删除标签' });
    }

    console.log(`[FORCE_DELETE_TAG] 开始强制删除标签: "${tagName}"`);

    // 检查标签是否存在
    const tag = await Tag.findOne({ name: tagName.trim() });
    if (!tag) {
      console.log(`[FORCE_DELETE_TAG] 标签不存在: "${tagName}"`);
      return res.status(404).json({ error: '标签不存在' });
    }

    console.log(`[FORCE_DELETE_TAG] 标签信息:`, {
      id: tag._id,
      name: tag.name,
      usageCount: tag.usageCount,
      createdBy: tag.createdBy,
      createdAt: tag.createdAt
    });

    // 查找所有使用该标签的文件
    const filesWithTag = await File.find({ 'tags.name': tagName.trim() });
    console.log(`[FORCE_DELETE_TAG] 找到 ${filesWithTag.length} 个文件使用此标签`);

    if (filesWithTag.length > 0) {
      console.log(`[FORCE_DELETE_TAG] 开始清理文件上的标签`);
      
      // 从所有文件上移除该标签
      for (const file of filesWithTag) {
        try {
          // 移除标签
          file.tags = file.tags.filter(t => t.name !== tagName.trim());
          
          // 更新标签顺序数组
          if (file.tagOrder) {
            file.tagOrder = file.tagOrder.filter(name => name !== tagName.trim());
          }
          
          await file.save();
          console.log(`[FORCE_DELETE_TAG] 已从文件移除标签: ${file.originalName || file.filename}`);
        } catch (fileUpdateError) {
          console.error(`[FORCE_DELETE_TAG] 更新文件失败:`, fileUpdateError);
          return res.status(500).json({ 
            error: `清理文件标签时发生错误`,
            details: {
              fileId: file._id,
              fileName: file.originalName || file.filename,
              error: fileUpdateError.message
            }
          });
        }
      }
      
      console.log(`[FORCE_DELETE_TAG] 已从 ${filesWithTag.length} 个文件上移除标签`);
    }

    // 删除标签
    console.log(`[FORCE_DELETE_TAG] 开始删除标签: ${tag._id}`);
    await Tag.findByIdAndDelete(tag._id);
    console.log(`[FORCE_DELETE_TAG] 标签强制删除成功: "${tagName}"`);
    
    res.json({ 
      success: true, 
      message: '标签强制删除成功',
      details: {
        deletedTag: {
          name: tag.name,
          id: tag._id
        },
        cleanedFiles: filesWithTag.length,
        warning: '已从所有文件上移除该标签'
      }
    });
  } catch (error) {
    console.error(`[FORCE_DELETE_TAG] 强制删除标签时发生错误:`, {
      tagName: req.body?.tagName,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({ 
      error: '强制删除标签时发生服务器错误',
      details: error.message
    });
  }
};

// 清理孤立的标签（usageCount > 0 但实际没有文件使用）
const cleanupOrphanedTags = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin') {
      return res.status(403).json({ error: '只有管理员可以清理孤立标签' });
    }

    console.log(`[CLEANUP_ORPHANED_TAGS] 开始清理孤立标签`);

    // 获取所有标签
    const allTags = await Tag.find({ usageCount: { $gt: 0 } });
    console.log(`[CLEANUP_ORPHANED_TAGS] 找到 ${allTags.length} 个usageCount > 0的标签`);

    const cleanedTags = [];
    const orphanedTags = [];

    for (const tag of allTags) {
      try {
        // 检查是否有文件实际使用这个标签
        const filesWithTag = await File.findOne({ 'tags.name': tag.name });
        
        if (!filesWithTag) {
          // 没有文件使用这个标签，但usageCount > 0，需要清理
          console.log(`[CLEANUP_ORPHANED_TAGS] 发现孤立标签: "${tag.name}" (usageCount: ${tag.usageCount})`);
          
          tag.usageCount = 0;
          await tag.save();
          
          orphanedTags.push({
            name: tag.name,
            oldUsageCount: tag.usageCount,
            newUsageCount: 0
          });
          
          console.log(`[CLEANUP_ORPHANED_TAGS] 已清理孤立标签: "${tag.name}"`);
        } else {
          // 有文件使用，检查usageCount是否与实际使用情况一致
          const actualUsageCount = await File.countDocuments({ 'tags.name': tag.name });
          
          if (actualUsageCount !== tag.usageCount) {
            console.log(`[CLEANUP_ORPHANED_TAGS] 标签 "${tag.name}" usageCount不一致: 数据库=${tag.usageCount}, 实际=${actualUsageCount}`);
            
            const oldUsageCount = tag.usageCount;
            tag.usageCount = actualUsageCount;
            await tag.save();
            
            cleanedTags.push({
              name: tag.name,
              oldUsageCount: oldUsageCount,
              newUsageCount: actualUsageCount
            });
            
            console.log(`[CLEANUP_ORPHANED_TAGS] 已修正标签 "${tag.name}" 的usageCount: ${oldUsageCount} -> ${actualUsageCount}`);
          }
        }
      } catch (tagCheckError) {
        console.error(`[CLEANUP_ORPHANED_TAGS] 检查标签 "${tag.name}" 时出错:`, tagCheckError);
      }
    }

    console.log(`[CLEANUP_ORPHANED_TAGS] 清理完成，修正了 ${cleanedTags.length} 个标签，清理了 ${orphanedTags.length} 个孤立标签`);

    res.json({
      success: true,
      message: '孤立标签清理完成',
      details: {
        correctedTags: cleanedTags,
        orphanedTags: orphanedTags,
        totalProcessed: allTags.length
      }
    });
  } catch (error) {
    console.error(`[CLEANUP_ORPHANED_TAGS] 清理孤立标签时发生错误:`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    return res.status(500).json({ 
      error: '清理孤立标签时发生服务器错误',
      details: error.message
    });
  }
};

module.exports = {
  uploadFile,
  uploadCadFile,
  uploadFolder,
  searchFiles,
  downloadFile,
  downloadFolder,
  checkFolderDownloadStatus,
  checkFileStatus,
  getFileDetails,
  deleteFile,
  deleteAllFiles,
  batchDeleteFiles,
  createFolder,
  addTags,
  removeTags,
  getAllTags,
  createTag,
  updateTagOrder,
  deleteTag,
  renameFile,
  getArchivingProgress,
  forceDeleteTag,
  cleanupOrphanedTags
};