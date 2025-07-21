// 加载环境变量
require('dotenv').config();

module.exports = {
  // 默认存储配额 (500GB)
  DEFAULT_STORAGE_QUOTA: parseInt(process.env.DEFAULT_STORAGE_QUOTA) || 1024 * 1024 * 1024 * 500,
  
  // JWT配置
  JWT_EXPIRATION: process.env.JWT_EXPIRES_IN || '1h', // 1小时 后JWT token 过期
  jwtSecret: process.env.JWT_SECRET || 'nas_secret_key', // JWT密钥
  
  // 上传文件配置
  UPLOAD_MAX_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 1024 * 1024 * 1024 * 20, // 单个文件最大20GB
  ALLOWED_FILE_TYPES: process.env.ALLOWED_FILE_TYPES ? process.env.ALLOWED_FILE_TYPES.split(',') : ['*'], // 允许所有文件类型
  
  // 界面显示配置
  SHOW_USER_INFO: process.env.SHOW_USER_INFO === 'true' || false, // 是否显示用户信息框
}; 