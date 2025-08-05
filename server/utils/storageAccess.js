const fs = require('fs');
const path = require('path');
const config = require('../config');

class StorageAccess {
  constructor() {
    // 存储主机配置
    this.storageHost = config.STORAGE_HOST_IP;
    this.storagePath = config.STORAGE_PATH;
    
    // 构建网络路径：\\IP\共享名
    // 例如：\\10.172.79.26\storage
    // 注意：虽然共享显示为 \\WA005104\storage，但通过IP访问时使用IP地址
    this.networkPath = `\\\\${this.storageHost}\\storage`;
    
    // 注意：如果共享的是 F:\Code\NAS_DEMO\NAS\storage
    // 那么 \\10.172.79.26\storage 就直接指向这个目录
    // 不需要额外的路径拼接
  }

  // 获取完整的存储路径
  getStoragePath(relativePath = '') {
    // 构建完整的网络路径
    // 例如：\\10.172.79.26\storage\uploads\home\file.txt
    const fullPath = path.join(this.networkPath, relativePath);
    return fullPath;
  }

  // 检查文件是否存在
  async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  // 读取文件
  async readFile(filePath, options = {}) {
    try {
      return await fs.promises.readFile(filePath, options);
    } catch (error) {
      console.error('读取存储文件失败:', error.message);
      throw error;
    }
  }

  // 写入文件
  async writeFile(filePath, data, options = {}) {
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      await this.ensureDirectoryExists(dir);
      
      return await fs.promises.writeFile(filePath, data, options);
    } catch (error) {
      console.error('写入存储文件失败:', error.message);
      throw error;
    }
  }

  // 删除文件
  async deleteFile(filePath) {
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (error) {
      console.error('删除存储文件失败:', error.message);
      throw error;
    }
  }

  // 创建目录
  async createDirectory(dirPath) {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      console.error('创建存储目录失败:', error.message);
      throw error;
    }
  }

  // 确保目录存在
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
      return true;
    } catch (error) {
      console.error('确保存储目录存在失败:', error.message);
      throw error;
    }
  }

  // 重命名文件
  async renameFile(oldPath, newPath) {
    try {
      await fs.promises.rename(oldPath, newPath);
      return true;
    } catch (error) {
      console.error('重命名存储文件失败:', error.message);
      throw error;
    }
  }

  // 获取文件信息
  async getFileStats(filePath) {
    try {
      return await fs.promises.stat(filePath);
    } catch (error) {
      console.error('获取存储文件信息失败:', error.message);
      throw error;
    }
  }

  // 读取目录
  async readDirectory(dirPath) {
    try {
      return await fs.promises.readdir(dirPath);
    } catch (error) {
      console.error('读取存储目录失败:', error.message);
      throw error;
    }
  }

  // 创建文件流
  createReadStream(filePath, options = {}) {
    try {
      return fs.createReadStream(filePath, options);
    } catch (error) {
      console.error('创建存储文件读取流失败:', error.message);
      throw error;
    }
  }

  // 创建写入流
  createWriteStream(filePath, options = {}) {
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      this.ensureDirectoryExists(dir);
      
      return fs.createWriteStream(filePath, options);
    } catch (error) {
      console.error('创建存储文件写入流失败:', error.message);
      throw error;
    }
  }

  // 复制文件
  async copyFile(sourcePath, targetPath) {
    try {
      // 确保目标目录存在
      const targetDir = path.dirname(targetPath);
      await this.ensureDirectoryExists(targetDir);
      
      return await fs.promises.copyFile(sourcePath, targetPath);
    } catch (error) {
      console.error('复制存储文件失败:', error.message);
      throw error;
    }
  }

  // 检查存储连接
  async checkConnection() {
    try {
      await fs.promises.access(this.networkPath);
      return true;
    } catch (error) {
      console.error('存储主机连接失败:', error.message);
      return false;
    }
  }
}

module.exports = new StorageAccess(); 