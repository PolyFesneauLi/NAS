const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // 检查用户名是否已存在
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // 哈希密码
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 检查是否是第一个用户
    const userCount = await User.countDocuments();
    
    // 设置用户角色：第一个用户是admin，其他都是normal
    const userRole = userCount === 0 ? 'admin' : 'normal';
    console.log(`创建用户 ${username}, 用户总数: ${userCount}, 设置角色为: ${userRole}`);

    // 创建新用户
    const user = new User({
      username,
      password: hashedPassword,
      role: userRole,
      createdAt: new Date()
    });

    await user.save();

    // 生成 JWT
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRATION
    });

    // 保存用户信息到本地文件
    try {
      const userInfo = {
        id: user._id,
        username: user.username,
        role: user.role,
        usedStorage: 0,
        createdAt: user.createdAt
      };

      const userFilePath = path.join(__dirname, '../../storage/users', `${username}.json`);
      await fs.writeFile(userFilePath, JSON.stringify(userInfo, null, 2));
      console.log(`用户信息已保存到本地: ${username}.json`);
    } catch (error) {
      console.error('保存本地用户文件失败:', error);
      // 继续执行，不影响注册流程
    }

    res.status(201).json({ 
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        usedStorage: 0
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
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

    // 准备用户信息
    const userInfo = {
      id: user._id,
      username: user.username,
      storageQuota: user.storageQuota,
      usedStorage: user.usedStorage,
      role: user.role,
      lastLogin: new Date().toISOString()
    };

    // 保存用户信息到本地文件
    try {
      const userFilePath = path.join(__dirname, '../../storage/users', `${username}.json`);
      await fs.writeFile(userFilePath, JSON.stringify(userInfo, null, 2));
    } catch (error) {
      console.error('Error saving user info to local storage:', error);
      // 继续执行，不影响登录流程
    }

    // 返回用户信息
    res.json({ 
      token,
      user: userInfo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};