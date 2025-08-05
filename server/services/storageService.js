const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../config');

class StorageService {
  constructor() {
    this.storageHost = config.STORAGE_HOST_IP;
    this.storagePort = process.env.PORT || 5000;
    this.baseURL = `http://${this.storageHost}:${this.storagePort}`;
  }

  // 检查存储主机连接
  async checkConnection() {
    try {
      const response = await axios.get(`${this.baseURL}/api/health`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      console.error('存储主机连接失败:', error.message);
      return false;
    }
  }

  // 上传文件到存储主机
  async uploadFile(filePath, targetPath) {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      formData.append('targetPath', targetPath);

      const response = await axios.post(`${this.baseURL}/api/storage/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5分钟超时
      });

      return response.data;
    } catch (error) {
      console.error('文件上传到存储主机失败:', error.message);
      throw error;
    }
  }

  // 从存储主机下载文件
  async downloadFile(storagePath, localPath) {
    try {
      const response = await axios.get(`${this.baseURL}/api/storage/download`, {
        params: { path: storagePath },
        responseType: 'stream',
        timeout: 300000, // 5分钟超时
      });

      const writer = fs.createWriteStream(localPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      console.error('从存储主机下载文件失败:', error.message);
      throw error;
    }
  }

  // 检查文件在存储主机上的状态
  async checkFileStatus(storagePath) {
    try {
      const response = await axios.get(`${this.baseURL}/api/storage/check`, {
        params: { path: storagePath },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      console.error('检查存储主机文件状态失败:', error.message);
      throw error;
    }
  }

  // 删除存储主机上的文件
  async deleteFile(storagePath) {
    try {
      const response = await axios.delete(`${this.baseURL}/api/storage/delete`, {
        params: { path: storagePath },
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      console.error('删除存储主机文件失败:', error.message);
      throw error;
    }
  }

  // 创建文件夹在存储主机上
  async createFolder(storagePath) {
    try {
      const response = await axios.post(`${this.baseURL}/api/storage/folder`, {
        path: storagePath,
      }, {
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      console.error('在存储主机创建文件夹失败:', error.message);
      throw error;
    }
  }

  // 获取存储主机上的文件列表
  async listFiles(storagePath) {
    try {
      const response = await axios.get(`${this.baseURL}/api/storage/list`, {
        params: { path: storagePath },
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      console.error('获取存储主机文件列表失败:', error.message);
      throw error;
    }
  }

  // 重命名存储主机上的文件
  async renameFile(oldPath, newPath) {
    try {
      const response = await axios.put(`${this.baseURL}/api/storage/rename`, {
        oldPath,
        newPath,
      }, {
        timeout: 30000,
      });

      return response.data;
    } catch (error) {
      console.error('重命名存储主机文件失败:', error.message);
      throw error;
    }
  }

  // 获取存储主机上的文件信息
  async getFileInfo(storagePath) {
    try {
      const response = await axios.get(`${this.baseURL}/api/storage/info`, {
        params: { path: storagePath },
        timeout: 10000,
      });

      return response.data;
    } catch (error) {
      console.error('获取存储主机文件信息失败:', error.message);
      throw error;
    }
  }
}

module.exports = new StorageService(); 