const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * 清理uploads目录下的孤立文件
 * 删除不在home文件夹下的所有孤立文件
 * 这些文件通常是上传中断或前端刷新导致的缓存文件
 */
function cleanupUploads() {
  console.log('🧹 Starting uploads cleanup process...');
  const uploadsDir = path.join(config.STORAGE_PATH, 'uploads');
  const downloadsDir = path.join(config.STORAGE_PATH, 'temp');
  
  try {
    // 检查uploads目录是否存在
    if (!fs.existsSync(uploadsDir)) {
      console.log('📁 Uploads directory does not exist, skipping cleanup');
      return;
    }

    const items = fs.readdirSync(uploadsDir);
    let cleanedCount = 0;
    let orphanCount = 0;
    let validFiles = [];
    let orphanedFiles = [];

    // 首先收集所有有效的文件和孤立文件
    items.forEach(item => {
      const itemPath = path.join(uploadsDir, item);
      const stats = fs.statSync(itemPath);

      if (stats.isFile()) {
        if (!isOrphanedFile(item, uploadsDir)) {
          validFiles.push(item);
        } else {
          orphanedFiles.push(item);
        }
      }
    });

    console.log(`📊 Found ${items.length} total files in uploads directory`);
    console.log(`📋 Found ${validFiles.length} valid files`);
    console.log(`🗑️  Found ${orphanedFiles.length} orphaned files`);

    // 显示孤立文件列表
    if (orphanedFiles.length > 0) {
      console.log('📋 Orphaned files found:');
      orphanedFiles.forEach(file => {
        console.log(`   - ${file}`);
      });
    }

    // 然后清理孤立文件
    orphanedFiles.forEach(item => {
      const itemPath = path.join(uploadsDir, item);
      
      try {
        fs.unlinkSync(itemPath);
        console.log(`🗑️  Cleaned up orphaned file: ${item}`);
        cleanedCount++;
      } catch (err) {
        console.log(`⚠️  Failed to delete ${item}: ${err.message}`);
        orphanCount++;
      }
    });

    if (cleanedCount > 0) {
      console.log(`✅ Cleanup completed: ${cleanedCount} orphaned files removed`);
    } else if (orphanCount > 0) {
      console.log(`⚠️  Found ${orphanCount} orphaned files but could not delete them (may be in use)`);
    } else if (orphanedFiles.length === 0) {
      console.log('✅ No orphaned files found in uploads directory');
    }
  } catch (err) {
    console.error('❌ Error during uploads cleanup:', err.message);
  }

  // 清理临时下载目录
  try {
    if (fs.existsSync(downloadsDir)) {
      const items = fs.readdirSync(downloadsDir);
      let tempCleanedCount = 0;
      
      items.forEach(item => {
        const itemPath = path.join(downloadsDir, item);
        const stats = fs.statSync(itemPath);
        if (stats.isFile()) {
          try {
            fs.unlinkSync(itemPath);
            console.log(`🗑️  Cleaned up temp file: ${item}`);
            tempCleanedCount++;
          } catch (err) {
            console.log(`⚠️  Failed to delete temp file ${item}: ${err.message}`);
          }
        }
      });
      
      if (tempCleanedCount > 0) {
        console.log(`✅ Temp cleanup completed: ${tempCleanedCount} temp files removed`);
      }
    }
  } catch (err) {
    console.error('❌ Error during downloads cleanup:', err.message);
  }
}

/**
 * 检查文件是否为孤立文件
 * 孤立文件的定义：
 * 1. 不在任何有效的文件夹结构中
 * 2. 不是以home_开头的文件
 * 3. 不是home文件夹本身
 * 4. 不在home文件夹中
 */
function isOrphanedFile(filename, uploadsDir) {
  // 检查是否为home文件夹本身
  if (filename === 'home') {
    return false;
  }
  
  // 检查是否以home_开头（这些是home文件夹中的文件）
  if (filename.startsWith('home_')) {
    return false;
  }
  
  // 检查是否在home文件夹中
  const homeDir = path.join(uploadsDir, 'home');
  if (fs.existsSync(homeDir)) {
    try {
      const homeFiles = fs.readdirSync(homeDir);
      if (homeFiles.includes(filename)) {
        return false;
      }
    } catch (err) {
      console.log(`⚠️  Error reading home directory: ${err.message}`);
    }
  }
  
  // 检查是否在任何其他有效的文件夹中
  const uploadsItems = fs.readdirSync(uploadsDir);
  for (const item of uploadsItems) {
    const itemPath = path.join(uploadsDir, item);
    const stats = fs.statSync(itemPath);
    
    // 如果是文件夹，检查文件是否在其中
    if (stats.isDirectory() && item !== 'home') {
      try {
        const folderFiles = fs.readdirSync(itemPath);
        if (folderFiles.includes(filename)) {
          return false;
        }
      } catch (err) {
        console.log(`⚠️  Error reading folder ${item}: ${err.message}`);
      }
    }
  }
  
  // 如果以上条件都不满足，则为孤立文件
  return true;
}

module.exports = cleanupUploads; 