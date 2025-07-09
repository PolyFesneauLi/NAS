const User = require('../models/User');
const File = require('../models/File');

// 获取当前用户信息
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .lean(); // 转换为普通JS对象
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 确保返回storageUsage对象
    res.json({
      id: user._id,
      username: user.username,
      createdAt: user.createdAt,
      role: user.role,
      storageUsage: {
        used: user.usedStorage || 0,
        quota: user.storageQuota || 1024 * 1024 * 1024,
        percentage: Math.round(
          ((user.usedStorage || 0) / (user.storageQuota || 1024 * 1024 * 1024)) * 100)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 更新用户存储配额
exports.updateStorageQuota = async (req, res) => {
  try {
    const { newQuota } = req.body;
    
    if (!newQuota || isNaN(newQuota) || newQuota <= 0) {
      return res.status(400).json({ error: 'Invalid storage quota' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 新配额不能小于已使用空间
    if (newQuota < user.usedStorage) {
      return res.status(400).json({ 
        error: `New quota must be at least ${formatBytes(user.usedStorage)}` 
      });
    }

    user.storageQuota = newQuota;
    await user.save();

    res.json({ 
      message: 'Storage quota updated successfully',
      newQuota: user.storageQuota
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 辅助函数：格式化字节大小
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm) + ' ' + sizes[i]);
}


//debug
// 删除所有用户（仅 admin）
exports.deleteAllUsers = async (req, res) => {
  try {
    await User.deleteMany({});
    res.json({ message: '所有用户已删除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

