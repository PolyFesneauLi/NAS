const mongoose = require('mongoose');
const File = require('./models/File');

// 连接数据库
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/nas';
console.log('连接字符串:', uri);

mongoose.connect(uri).then(async () => {
  console.log('已连接数据库:', mongoose.connection.name);
  console.log('当前集合:', File.collection.name);
  const files = await File.find({}, {
    _id: 1,
    originalName: 1,
    filename: 1,
    size: 1,
    owner: 1,
    createdAt: 1
  }).lean();
  console.log('文件数量:', files.length);
  console.log(JSON.stringify(files, null, 2));
  mongoose.disconnect();
}).catch(err => {
  console.error('连接失败:', err);
}); 