const User = require('../models/User');
const File = require('../models/File');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config');

// 获取当前用户信息
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 返回用户信息，包括存储使用情况
    res.json({
      id: user._id,
      username: user.username,
      role: user.role,
      storageUsage: {
        used: user.usedStorage || 0,
        quota: config.DEFAULT_STORAGE_QUOTA,
        percentage: Math.round(
          ((user.usedStorage || 0) / config.DEFAULT_STORAGE_QUOTA) * 100
        )
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 更新用户存储配额
exports.updateStorageQuota = async (req, res) => {
  try {
    const { quota } = req.body;
    
    // 验证配额值
    if (typeof quota !== 'number' || quota <= 0) {
      return res.status(400).json({ error: '无效的配额值' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 更新配额
    user.storageQuota = quota;
    await user.save();

    res.json({
      message: '存储配额更新成功',
      storageUsage: {
        used: user.usedStorage || 0,
        quota: user.storageQuota,
        percentage: Math.round(((user.usedStorage || 0) / user.storageQuota) * 100)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 删除所有用户（仅 admin）
exports.deleteAllUsers = async (req, res) => {
  const logs = [];
  try {
    // 0. 检查MongoDB连接
    logs.push(`当前MongoDB URL: ${mongoose.connection.host}:${mongoose.connection.port}`);
    logs.push(`数据库名称: ${mongoose.connection.name}`);
    
    // 1. 检查并删除MongoDB中的用户
    const usersCollection = mongoose.connection.collection('users');
    const beforeCount = await usersCollection.countDocuments();
    logs.push(`删除前MongoDB用户数量: ${beforeCount}`);
    
    const result = await usersCollection.deleteMany({});
    logs.push(`MongoDB删除结果: ${JSON.stringify(result)}`);
    
    const afterCount = await usersCollection.countDocuments();
    logs.push(`删除后MongoDB用户数量: ${afterCount}`);

    // 2. 检查并删除storage/users目录下的文件
    const usersDir = path.join(__dirname, '../../storage/users');
    try {
      const files = await fs.readdir(usersDir);
      logs.push(`找到users目录下的文件: ${files.join(', ')}`);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(usersDir, file);
          try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            logs.push(`准备删除文件 ${file}, 内容长度: ${fileContent.length}`);
            
            await fs.unlink(filePath);
            logs.push(`成功删除文件: ${file}`);
          } catch (fileError) {
            logs.push(`删除文件 ${file} 失败: ${fileError.message}`);
          }
        }
      }
    } catch (dirError) {
      logs.push(`读取users目录失败: ${dirError.message}`);
    }

    // 3. 检查并重置users.json
    const usersJsonPath = path.join(__dirname, '../../storage/users.json');
    try {
      const exists = await fs.access(usersJsonPath).then(() => true).catch(() => false);
      if (exists) {
        const content = await fs.readFile(usersJsonPath, 'utf8');
        logs.push(`当前users.json内容: ${content}`);
        
        await fs.writeFile(usersJsonPath, JSON.stringify({ users: [] }, null, 2));
        logs.push('已重置users.json为空数组');
      } else {
        logs.push('users.json文件不存在');
      }
    } catch (jsonError) {
      logs.push(`操作users.json失败: ${jsonError.message}`);
    }

    // 返回详细信息
    res.json({ 
      message: '删除操作完成',
      mongoResult: result.deletedCount + '条MongoDB记录已删除',
      logs: logs
    });
    
    // 同时在服务器控制台打印日志
    console.log('删除用户操作日志:\n' + logs.join('\n'));
    
  } catch (error) {
    logs.push(`操作失败: ${error.message}`);
    console.error('删除用户错误:\n' + logs.join('\n'));
    res.status(500).json({ 
      error: error.message,
      logs: logs 
    });
  }
};

// 重置当前用户已用空间为0
exports.resetUsedStorage = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.usedStorage = 0;
    await user.save();
    res.json({ message: '已用空间已重置为0', usedStorage: user.usedStorage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

