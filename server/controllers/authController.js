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

    // 检查是否是第一个用户
    const userCount = await User.countDocuments();
    
    // 设置用户角色和状态：第一个用户是admin且直接approved，其他都是normal且需要审核
    const userRole = userCount === 0 ? 'admin' : 'normal';
    const userStatus = userCount === 0 ? 'approved' : 'pending';
    console.log(`创建用户 ${username}, 用户总数: ${userCount}, 设置角色为: ${userRole}, 状态为: ${userStatus}`);

    // 创建新用户
    const user = new User({
      username,
      password, // 不需要手动哈希，让 mongoose 中间件处理
      role: userRole,
      status: userStatus,
      createdAt: new Date()
    });

    await user.save();

    // 生成 JWT
    const token = jwt.sign({ id: user._id, role: user.role }, config.jwtSecret, {
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

      const userFilePath = path.join(config.STORAGE_PATH, 'users', `${username}.json`);
      await fs.writeFile(userFilePath, JSON.stringify(userInfo, null, 2));
      // console.log(`用户信息已保存到本地: ${username}.json`);
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
        status: user.status,
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
    // console.log(`尝试登录用户: ${username}`);
    
    const user = await User.findOne({ username });
    if (!user) {
      // console.log(`用户不存在: ${username}`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // console.log(`找到用户: ${username}, 状态: ${user.status}, 角色: ${user.role}`);

    // 检查用户状态
    if (user.status === 'pending') {
      // console.log(`用户 ${username} 状态为待审核`);
      return res.status(403).json({ error: '您的账号正在等待管理员审核' });
    }

    if (user.status === 'rejected') {
      // console.log(`用户 ${username} 状态为已拒绝`);
      return res.status(403).json({ error: '您的注册申请已被拒绝' });
    }

    const isMatch = await user.comparePassword(password);
    // console.log(`密码验证结果: ${isMatch ? '成功' : '失败'}`);
    
    if (!isMatch) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    // console.log(`用户 ${username} 登录成功，生成token`);

    res.json({ 
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: error.message });
  }
};