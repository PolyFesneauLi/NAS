const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Added for fs.existsSync
const config = require('../config');
const storageAccess = require('./storageAccess');

// 使用存储访问工具获取uploads路径
const UPLOADS_PATH = storageAccess.getStoragePath('uploads');
// const iconv = require('iconv-lite'); // Removed as per edit hint

// 配置存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_PATH);
  },
  filename: (req, file, cb) => {
    let name = file.originalname;
    // 检查是否为乱码（典型 UTF-8 字节流被当成 latin1 解析）
    if (/^[\x00-\x7F]*$/.test(name) === false && /[^\u0000-\u00ff]/.test(name) === false) {
      // 可能是 UTF-8 字节流
      const buf = Buffer.from(name, 'latin1');
      try {
        name = buf.toString('utf8');
      } catch (e) {
        // 保底
      }
    }
    let base = path.basename(name, path.extname(name));
    const ext = path.extname(name);
    let finalName = name;
    let counter = 1;
    let fsPath = path.join(UPLOADS_PATH, finalName);
    while (fs.existsSync(fsPath)) {
      finalName = `${base}(${counter})${ext}`;
      fsPath = path.join(UPLOADS_PATH, finalName);
      counter++;
    }
    cb(null, finalName);
  }
});

// 完整的文件类型白名单
const allowedTypes = [
  // 文本和文档格式
  'text/plain',                          // .txt, .log, .err, .bak, .lsp, .fas, .dat, .tmp
  'text/markdown',                       // .md
  'application/pdf',                     // .pdf
  'text/csv',                            // .csv
  'application/csv',                     // .csv (另一种MIME类型)
  
  // Office文档
  'application/msword',                  // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',            // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-powerpoint',       // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
  
  // 编程源代码
  'text/x-c',                            // .c
  'text/x-c++',                          // .cpp, .cxx, .cc
  'text/x-csrc',                         // 另一种C MIME
  'text/x-chdr',                         // .h (C头文件)
  'application/javascript',              // .js
  'text/javascript',                     // 另一种JS MIME
  'text/x-python',                       // .py
  'text/x-php',                          // .php
  'text/x-shellscript',                  // .sh
  
  // 网页相关
  'text/html',                           // .html, .htm
  'text/css',                            // .css
  'application/json',                    // .json
  'application/xml',                     // .xml
  
  // 图片格式
  'image/jpeg',                          // .jpg, .jpeg
  'image/png',                           // .png
  'image/svg+xml',                       // .svg
  'image/bmp',                           // .bmp
  
  // CAD/工程图格式
  'application/acad',                    // .dwg (AutoCAD)
  'application/dxf',                     // .dxf
  'application/vnd.dwg',                 // 另一种DWG MIME
  'model/step',                          // .stp, .step
  'model/iges',                          // .igs, .iges
  'application/sldworks',                // SolidWorks
  'application/x-sldworks',              // .smbx
  'application/dgn',                     // .dgn (MicroStation)
  'application/x-dgn', 
  'application/vnd.dgn',
  'model/dgn',
  
  // 压缩包
  'application/x-7z-compressed',         // .7z
  'application/x-rar-compressed',        // .rar
  'application/x-tar',                   // .tar
  'application/x-gzip',                  // .gz
  'application/x-bzip2',                 // .bz2
  'application/x-xz',                    // .xz
  'application/x-wim',                   // .wim
  'application/x-zip-compressed',        // .zip
  'application/zip',                     // .zip (标准MIME类型)
  'application/x-zip',                   // .zip (另一种MIME类型)

  // 可执行文件
  'application/x-msdownload',            // .exe
  'application/x-ms-dos-executable',     // .exe
  'application/x-executable',            // .exe
  'application/x-ms-windows-executable', // .exe
  'application/x-ms-windows-installer',  // .exe
  'application/x-ms-windows-package',    // .exe
  
  // 数据库文件
  'application/x-sqlite3',               // .db
  'application/vnd.sqlite3',             // .db (另一种MIME)
  
  // 其他常见类型
  'application/octet-stream',             // 通用二进制流
];

// 扩展名白名单（用于双重验证）- 确保与前端配置一致
const allowedExtensions = [
  // 文档
  '.txt', '.md', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv',
  
  // 源代码
  '.c', '.cpp', '.h', '.hpp', '.java', '.js', '.py', '.php', '.sh',
  '.html', '.htm', '.css', '.json', '.xml',
  
  // 图片/CAD
  '.jpg', '.jpeg', '.png', '.svg', '.bmp',
  '.dwg', '.dxf', '.stp', '.step', '.igs', '.iges', '.sldprt', '.sldasm',
  '.dwl', '.smbx', '.dgn', // 明确添加.dgn
  '.dst', '.dwl2', '.sbp', '.ovkml', '.ovobj', // 补充统计中的其他CAD格式
  
  // 压缩包/可执行文件
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.wim', '.iso', '.exe',
  
  // 数据库文件
  '.db',
  
  // 其他必需类型
  '.bak', '.log', '.err', '.lsp', '.fas', '.dat', '.tmp'
];

// 增强的文件过滤器
const fileFilter = (req, file, cb) => {
  const fileExt = path.extname(file.originalname).toLowerCase();
  
  // 双重验证：MIME类型或扩展名
  const isTypeValid = allowedTypes.includes(file.mimetype);
  const isExtValid = allowedExtensions.includes(fileExt);
  
  if (isTypeValid || isExtValid) {
    cb(null, true);
  } else {
    console.log( "[TYPE] ❌ 不支持的文件类型:", file.mimetype, fileExt);
    console.log( "[TYPE] ❌ 不支持的文件类型:", isTypeValid, isExtValid);
    cb(new Error(
      `不支持的文件类型。允许上传：\n` +
      `• 文档：PDF/Word/Excel/PowerPoint/TXT/Markdown\n` +
      `• 源代码：C/C++/JS/Python/Java等\n` +
      `• 网页文件：HTML/CSS/JSON\n` +
      `• 工程图：DWG/DXF/STEP/IGES/SolidWorks/DGN\n` +
      `• 图片：JPG/PNG/SVG/BMP\n` +
      `• 压缩包：ZIP/RAR/7Z等\n` +
      `• 其他：LOG/ERR/BAK/LSP/FAS/DAT/TMP/DB等`
    ), false);
  }
};

// 创建上传中间件
const upload = multer({ 
  storage,
  fileFilter,
  limits: { 
    fileSize: config.UPLOAD_MAX_SIZE, // 使用配置文件中的限制 (20GB)
    files: 10 // 每次最多10个文件
  }
});

// 特别为CAD文件创建独立的上传中间件
const cadUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.UPLOAD_MAX_SIZE, // 使用相同的限制
    files: 5
  }
});

// 为文件夹上传创建专门的存储配置
const folderStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_PATH);
  },
  filename: (req, file, cb) => {
    // 保留完整的相对路径 - 使用 originalname，它现在包含 webkitRelativePath
    let relativePath = file.originalname;
    
    // 检查是否为乱码（典型 UTF-8 字节流被当成 latin1 解析）
    if (/^[\x00-\x7F]*$/.test(relativePath) === false && /[^\u0000-\u00ff]/.test(relativePath) === false) {
      // 可能是 UTF-8 字节流
      const buf = Buffer.from(relativePath, 'latin1');
      try {
        relativePath = buf.toString('utf8');
      } catch (e) {
        // 保底
      }
    }
    
    // 使用完整路径作为文件名，这样可以在后续处理中提取路径信息
    // 但是我们需要确保路径分隔符是系统兼容的
    const normalizedPath = relativePath.replace(/[\/\\]/g, path.sep);
    cb(null, normalizedPath);
  }
});

// 为文件夹上传创建独立的上传中间件
const folderUpload = multer({
  storage: folderStorage,
  fileFilter,
  limits: {
    fileSize: config.UPLOAD_MAX_SIZE, // 使用相同的限制
    files: 1000 // 允许更多文件用于文件夹上传
  }
});

module.exports = {
  upload,        // 常规文件上传
  cadUpload,     // CAD大文件上传
  folderUpload,  // 文件夹上传
  allowedTypes,  // 导出供其他模块使用
  allowedExtensions
};