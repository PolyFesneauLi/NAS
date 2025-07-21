# 自动清理功能说明

## 功能概述
在每次后端服务器启动时，自动清理 `storage/uploads` 目录下的孤立文件。

## 清理规则
- 只删除文件，不删除文件夹
- 主要清理以下类型的孤立文件：
  - 常见文件格式：`.zip`, `.txt`, `.png`, `.jpg`, `.jpeg`, `.pdf`, `.docx`, `.rar`, `.7z`, `.dwg`, `.dwl`, `.dwl2`, `.ppt`, `.pptx`, `.xlsx`
  - 包含特定关键词的文件：`localfile`, `Simulator`

## 触发时机
- 每次服务器启动时自动执行
- 在 MongoDB 连接成功后、初始化根目录之前执行

## 日志输出
- `🗑️ Cleaned up orphaned file: [文件名]` - 成功删除文件
- `⚠️ Failed to delete [文件名]: [错误信息]` - 删除失败
- `✅ Cleanup completed: [数量] orphaned files removed` - 清理完成
- `✅ No orphaned files found in uploads directory` - 没有找到孤立文件

## 手动执行
如果需要手动清理，可以运行：
```bash
node -e "const cleanup = require('./server/utils/cleanupUploads'); cleanup();"
```

## 安全说明
- 只清理 uploads 根目录下的文件
- 不会删除子文件夹中的文件
- 不会删除文件夹本身
- 清理前会检查文件类型和名称模式 