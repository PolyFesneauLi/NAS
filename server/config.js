module.exports = {
  // 默认存储配额 (500GB)
  DEFAULT_STORAGE_QUOTA: 1024 * 1024 * 1024 * 500,
  
  // JWT配置
  JWT_EXPIRATION: '1h', // 1小时 后JWT token 过期
  jwtSecret: 'nas_secret_key', // JWT密钥
  
  // 上传文件配置
  UPLOAD_MAX_SIZE: 1024 * 1024 * 1024*20, // 单个文件最大20GB
  ALLOWED_FILE_TYPES: ['*'] // 允许所有文件类型
}; 