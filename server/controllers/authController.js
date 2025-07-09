const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.register = async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    // 检查用户名是否已存在
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // 哈希密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 只有第一个用户或已登录的 admin 可以指定 role，否则强制 normal
    let userRole = 'normal';
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      userRole = role === 'admin' ? 'admin' : 'normal';
    } else if (req.user && req.user.role === 'admin' && (role === 'admin' || role === 'normal')) {
      userRole = role;
    }

    // 创建新用户
    const user = new User({
      username,
      password: hashedPassword,
      storageQuota: 1024 * 1024 * 1024, // 1GB
      role: userRole
    });

    await user.save();

    // 生成 JWT
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });

    res.status(201).json({ 
      token,
      user: {
        id: user._id,
        username: user.username,
        storageQuota: user.storageQuota,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // 检查用户是否存在
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // 验证密码
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // 生成 JWT
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });

    // 返回用户信息
    res.json({ 
      token,
      user: {
        id: user._id,
        username: user.username,
        storageQuota: user.storageQuota,
        usedStorage: user.usedStorage,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};