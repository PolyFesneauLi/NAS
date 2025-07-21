const fs = require('fs');
const path = require('path');

// 检查.env文件是否存在
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, 'env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    // 复制env.example到.env
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
    fs.writeFileSync(envPath, envExampleContent);
    console.log('✅ .env文件已从env.example创建');
  } else {
    console.log('❌ env.example文件不存在');
  }
} else {
  console.log('ℹ️ .env文件已存在');
} 