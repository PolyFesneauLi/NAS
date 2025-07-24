require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const userRoutes = require('./routes/userRoutes');
const apiRoutes = require('./routes/api');
const initRootFolder = require('./utils/initRootFolder');
const cleanupUploads = require('./utils/cleanupUploads');

const app = express();
const PORT = process.env.PORT || 5000;

// 中间件
app.use(cors());

// 增加请求大小限制
app.use(express.json({ limit: '20gb' }));
app.use(express.urlencoded({ limit: '20gb', extended: true }));

// 设置超时时间为1小时
app.use((req, res, next) => {
  res.setTimeout(3600000, () => {
    // console.log('请求超时');
    res.status(408).send('Request timeout');
  });
  next();
});

app.use('/uploads', express.static(path.join(__dirname, '../storage/uploads')));

// 连接 MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('✅ MongoDB connected');
  // 清理孤立文件
  cleanupUploads();
  // 初始化根目录
  await initRootFolder();
})
.catch(err => console.error('❌ MongoDB connection error:', err));

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/users', userRoutes);
app.use('/api', apiRoutes);

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});