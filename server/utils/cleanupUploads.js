const fs = require('fs');
const path = require('path');
const config = require('../config');

/**
 * 清理uploads目录下的孤立文件
 * 删除不在home文件夹下的所有孤立文件
 * 这些文件通常是上传中断或前端刷新导致的缓存文件
 */
function cleanupUploads() {
  const uploadsDir = config.STORAGE_PATH;
  const downloadsDir = path.join(__dirname, '../../storage/temp');
  
  try {
    // 检查uploads目录是否存在
    if (!fs.existsSync(uploadsDir)) {
      console.log('📁 Uploads directory does not exist, skipping cleanup');
      return;
    }

    const items = fs.readdirSync(uploadsDir);
    let cleanedCount = 0;

    items.forEach(item => {
      const itemPath = path.join(uploadsDir, item);
      const stats = fs.statSync(itemPath);

      // 只处理文件，不处理文件夹
      if (stats.isFile()) {
        // 删除所有不在 home 文件夹下的孤立文件
        // 保留 home 文件夹下的文件，删除其他所有孤立文件
        const isInHomeFolder = item.startsWith('home_') || item === 'home';
        const isHomeFolder = item === 'home';
        
        // 如果不是 home 文件夹，且不是以 home_ 开头的文件，则删除
        if (!isInHomeFolder && !isHomeFolder) {
          try {
            fs.unlinkSync(itemPath);
            console.log(`🗑️  Cleaned up orphaned file: ${item}`);
            cleanedCount++;
          } catch (err) {
            console.log(`⚠️  Failed to delete ${item}: ${err.message}`);
          }
        }
      }
    });

    if (cleanedCount > 0) {
      console.log(`✅ Cleanup completed: ${cleanedCount} orphaned files removed`);
    } else {
      console.log('✅ No orphaned files found in uploads directory');
    }
  } catch (err) {
    console.error('❌ Error during uploads cleanup:', err.message);
  }

  try { // clean all files in download temp directory
    if (fs.existsSync(downloadsDir)) {
      const items = fs.readdirSync(downloadsDir);
      items.forEach(item => {
        const itemPath = path.join(downloadsDir, item);
        const stats = fs.statSync(itemPath);
        if (stats.isFile()) {
          fs.unlinkSync(itemPath);
          console.log(`🗑️  Cleaned up temp file: ${item}`);
        }
      });
    }
  } catch (err) {
    console.error('❌ Error during downloads cleanup:', err.message);
  }
}

module.exports = cleanupUploads; 