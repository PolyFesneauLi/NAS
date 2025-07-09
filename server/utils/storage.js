const multer = require('multer');
const path = require('path');
const { STORAGE_PATH } = process.env;

// 配置存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_PATH);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// 完整的文件类型白名单
const allowedTypes = [
  // 文本和文档格式
  'text/plain',                          // .txt
  'text/markdown',                       // .md
  'application/pdf',                     // .pdf
  
  // Office文档
  'application/msword',                  // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel',            // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  
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
  
  // CAD/工程图格式
  'application/acad',                    // .dwg (AutoCAD)
  'application/dxf',                     // .dxf
  'application/vnd.dwg',                 // 另一种DWG MIME
  'model/step',                          // .stp, .step
  'model/iges',                          // .igs, .iges
  'application/sldworks',                // SolidWorks
  
  // 其他常见类型
  'application/octet-stream'             // 通用二进制流
];

// 扩展名白名单（用于双重验证）
const allowedExtensions = [
  // 文档
  '.txt', '.md', '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  
  // 源代码
  '.c', '.cpp', '.h', '.hpp', '.java', '.js', '.py', '.php', '.sh',
  '.html', '.htm', '.css', '.json', '.xml',
  
  // 图片/CAD
  '.jpg', '.jpeg', '.png', '.svg',
  '.dwg', '.dxf', '.stp', '.step', '.igs', '.iges', '.sldprt', '.sldasm'
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
    cb(new Error(
      `不支持的文件类型。允许上传：\n` +
      `• 文档：PDF/Word/Excel/TXT/Markdown\n` +
      `• 源代码：C/C++/JS/Python/Java等\n` +
      `• 网页文件：HTML/CSS/JSON\n` +
      `• 工程图：DWG/DXF/STEP/IGES/SolidWorks\n` +
      `• 图片：JPG/PNG/SVG`
    ), false);
  }
};

// 创建上传中间件
const upload = multer({ 
  storage,
  fileFilter,
  limits: { 
    fileSize: 1024 * 1024 * 100, // 默认100MB限制
    files: 10 // 每次最多10个文件
  }
});

// 特别为CAD文件创建独立的上传中间件
const cadUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1024 * 1024 * 500, // CAD文件500MB限制
    files: 5
  }
});

module.exports = {
  upload,        // 常规文件上传
  cadUpload,     // CAD大文件上传
  allowedTypes,  // 导出供其他模块使用
  allowedExtensions
};