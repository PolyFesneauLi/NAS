const fs = require('fs');
const path = require('path');

/**
 * 清理uploads目录下的孤立文件
 * 删除不在任何子文件夹中的文件（如localfile.zip等）
 * 这些文件通常是上传中断或前端刷新导致的缓存文件
 */
function cleanupUploads() {
  const uploadsDir = path.join(__dirname, '../../storage/uploads');
  
  try {
    // 检查uploads目录是否存在
    if (!fs.existsSync(uploadsDir)) {
      console.log('📁 Uploads directory does not exist, skipping cleanup');
      return;
    }

    const items = fs.readdirSync(uploadsDir);
    let cleanedCount = 0;
    const commonExtensions = ['.zip', '.txt', '.png', '.jpg', '.jpeg', '.pdf', '.docx', '.rar', '.7z', '.dwg', '.dwl', '.dwl2', '.ppt', '.pptx', '.xlsx'];

    items.forEach(item => {
      const itemPath = path.join(uploadsDir, item);
      const stats = fs.statSync(itemPath);

      // 只处理文件，不处理文件夹
      if (stats.isFile()) {
        // 检查是否是常见的孤立文件类型
        const hasCommonExtension = commonExtensions.some(ext => item.toLowerCase().endsWith(ext));
        const isLikelyOrphaned = hasCommonExtension || item.includes('localfile') || item.includes('Simulator');
        
        if (isLikelyOrphaned) {
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
}

module.exports = cleanupUploads; 