# NAS System

一个基于 Node.js 的网络存储系统，支持文件上传、下载、中文搜索等功能。

## 系统要求

- Windows 7/8/10/11
- MongoDB 4.x 或更高版本（[下载地址](https://www.mongodb.com/try/download/community)）

## 快速开始（普通用户）

1. 安装 MongoDB
   - 下载并安装 [MongoDB Community Server](https://www.mongodb.com/try/download/community)
   - 安装时选择 "Install MongoDB as a Service"
   - 完成安装后，MongoDB 会自动作为 Windows 服务运行

2. 运行系统
   - 解压 `nas-system.zip` 到任意目录
   - 双击运行 `start.bat`
   - 系统会自动打开浏览器访问 http://localhost:3000

3. 常见问题
   - 如果提示 "MongoDB 服务未启动"：
     ```bash
     # 以管理员身份运行 CMD，输入：
     net start MongoDB
     ```
   - 如果提示端口被占用，请确保 3000 和 5000 端口未被其他程序使用

## 开发环境设置（开发者）

1. 安装 Node.js
   - 下载并安装 [Node.js 14.x LTS](https://nodejs.org/)
   - 验证安装：
     ```bash
     node --version  # 应显示 v14.x.x
     ```

2. 安装 MongoDB
   - 同上述 "快速开始" 中的步骤 1

3. 克隆项目
   ```bash
   git clone <repository-url>
   cd nas-system
   ```

4. 安装依赖
   ```bash
   # 安装打包工具
   npm install -g pkg@4.5.1

   # 安装项目依赖
   npm install
   cd client && npm install && cd ..
   cd server && npm install && cd ..
   ```

## 打包发布

1. 一键打包（推荐）
   ```bash
   # 在项目根目录执行
   build.bat
   ```
   打包完成后，在 `dist` 目录中会生成可分发的文件。

2. 手动打包步骤
   ```bash
   # 构建前端
   cd client
   npm run build
   cd ..

   # 打包整个应用
   npm run package
   ```

3. 发布文件说明
   - `nas-system.exe`: 主程序
   - `start.bat`: 启动脚本
   - `.env`: 配置文件（可选修改）

## 配置说明

1. 端口配置（可选）
   - 编辑 `.env` 文件：
     ```env
     PORT=5000              # 后端端口
     MONGODB_URI=mongodb://localhost:27017/nas
     JWT_SECRET=your_jwt_secret_key
     STORAGE_PATH=./storage/uploads
     ```

2. 存储路径
   - 默认存储在 `storage/uploads` 目录
   - 可以通过修改 `.env` 中的 `STORAGE_PATH` 更改

## 系统维护

1. 数据备份
   - 备份 MongoDB 数据：
     ```bash
     mongodump --db nas --out backup
     ```
   - 备份上传文件：复制 `storage/uploads` 目录

2. 日志查看
   - 系统日志位于 `logs` 目录
   - 按日期自动分割日志文件

## 技术支持

- 如遇问题，请查看上述 "常见问题" 部分
- 或提交 Issue 到项目仓库

## 许可证

ISC License