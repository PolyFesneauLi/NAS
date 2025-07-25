const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class FileConversionService {
  constructor() {
    this.CACHE_DIR = path.join(__dirname, '../cache');
    this.ensureCacheDir();
    this.startCleanupInterval();
  }

  // 确保缓存目录存在
  ensureCacheDir() {
    if (!fs.existsSync(this.CACHE_DIR)) {
      fs.mkdirSync(this.CACHE_DIR, { recursive: true });
    }
  }

  // 生成文件哈希
  generateFileHash(fileUrl) {
    return crypto.createHash('md5').update(fileUrl).digest('hex');
  }

  // 检查是否为Office文件
  isOfficeFile(filename) {
    const officeExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    const ext = path.extname(filename).toLowerCase();
    return officeExtensions.includes(ext);
  }

  // 下载文件
  async downloadFile(filePath, outputPath) {
    try {
      await fs.copy(filePath, outputPath);
      console.log(`[CONVERSION] 文件已复制到: ${outputPath}`);
      return true;
    } catch (error) {
      console.error(`[CONVERSION] 文件复制失败:`, error);
      return false;
    }
  }

  // 转换为PDF
  async convertToPdf(inputPath, outputPath) {
    try {
      // 检查系统是否安装了LibreOffice
      try {
        execSync('libreoffice --version', { stdio: 'ignore' });
      } catch (error) {
        console.error('[CONVERSION] LibreOffice未安装，无法转换Office文件');
        throw new Error('LibreOffice未安装');
      }

      // 使用LibreOffice转换
      const command = `libreoffice --headless --convert-to pdf "${inputPath}" --outdir "${path.dirname(outputPath)}"`;
      console.log(`[CONVERSION] 执行转换命令: ${command}`);
      
      execSync(command, { 
        stdio: 'pipe',
        timeout: 60000 // 60秒超时
      });

      // 检查输出文件是否存在
      if (fs.existsSync(outputPath)) {
        console.log(`[CONVERSION] 转换成功: ${outputPath}`);
        return true;
      } else {
        throw new Error('转换后的PDF文件未找到');
      }
    } catch (error) {
      console.error(`[CONVERSION] 转换失败:`, error);
      throw error;
    }
  }

  // 获取PDF预览URL
  async getPdfPreviewUrl(filePath, originalFilename) {
    try {
      // 检查是否为Office文件
      if (!this.isOfficeFile(originalFilename)) {
        throw new Error('不是Office文件');
      }

      // 生成缓存文件名
      const fileHash = this.generateFileHash(filePath);
      const pdfPath = path.join(this.CACHE_DIR, `${fileHash}.pdf`);

      // 如果已有缓存PDF，直接返回
      if (fs.existsSync(pdfPath)) {
        console.log(`[CONVERSION] 使用缓存PDF: ${pdfPath}`);
        return `/api/preview/cache/${fileHash}.pdf`;
      }

      // 复制原文件到缓存目录
      const tempPath = path.join(this.CACHE_DIR, `${fileHash}${path.extname(originalFilename)}`);
      const downloadSuccess = await this.downloadFile(filePath, tempPath);
      
      if (!downloadSuccess) {
        throw new Error('文件下载失败');
      }

      // 转换为PDF
      await this.convertToPdf(tempPath, pdfPath);

      // 删除临时文件
      try {
        fs.unlinkSync(tempPath);
      } catch (error) {
        console.warn(`[CONVERSION] 删除临时文件失败: ${tempPath}`, error);
      }

      return `/api/preview/cache/${fileHash}.pdf`;

    } catch (error) {
      console.error(`[CONVERSION] 获取PDF预览URL失败:`, error);
      throw error;
    }
  }

  // 清理过期缓存
  cleanupExpiredCache() {
    try {
      const files = fs.readdirSync(this.CACHE_DIR);
      const now = Date.now();
      const maxAge = 3600000; // 1小时

      files.forEach(file => {
        const filePath = path.join(this.CACHE_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (now - stats.mtimeMs > maxAge) {
          try {
            fs.unlinkSync(filePath);
            console.log(`[CONVERSION] 清理过期缓存: ${file}`);
          } catch (error) {
            console.warn(`[CONVERSION] 删除缓存文件失败: ${file}`, error);
          }
        }
      });
    } catch (error) {
      console.error(`[CONVERSION] 清理缓存失败:`, error);
    }
  }

  // 启动定时清理
  startCleanupInterval() {
    // 每小时清理一次缓存
    setInterval(() => {
      this.cleanupExpiredCache();
    }, 3600000);
  }

  // 获取缓存文件路径
  getCacheFilePath(filename) {
    return path.join(this.CACHE_DIR, filename);
  }
}

module.exports = new FileConversionService(); 