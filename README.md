# 分布式NAS文件管理系统

## 项目概述

这是一个支持多台物理机的分布式NAS文件管理系统，采用前后端分离架构，支持文件上传、下载、管理和多用户权限控制。本机可同时作为缓存机和存储机使用。

## 系统架构

### 分布式架构组件

1. **主控节点 (Master Node)** - 负责用户认证、权限管理、元数据管理
2. **存储节点 (Storage Node)** - 负责文件实际存储
3. **缓存节点 (Cache Node)** - 负责文件缓存，提高访问速度
4. **负载均衡器** - 分发请求到不同节点

### 技术栈

- **前端**: React.js
- **后端**: Node.js + Express
- **数据库**: MongoDB
- **缓存**: Redis (推荐)
- **文件系统**: 本地存储 + 网络存储

## 快速开始

### 环境要求

- **Node.js**: >= 16.0.0
- **MongoDB**: >= 4.4
- **Redis**: >= 6.0 (推荐用于分布式缓存)
- **操作系统**: Windows 10/11, Linux, macOS

### 一键启动

```bash
# Windows环境
start.bat

# Linux/macOS环境
./start.sh
```

### 一键停止

```bash
# Windows环境
stop.bat

# Linux/macOS环境
./stop.sh
```

## 分布式部署配置

### 1. 主控节点配置

主控节点负责统一的用户认证和权限管理：

#### 配置文件: `config/master.conf`

```ini
[Master]
role=master
port=5000
mongodb_uri=mongodb://master-db:27017/nas_master
jwt_secret=your_super_secret_key

[Security]
ssl_enabled=true
ssl_cert_path=./certs/server.crt
ssl_key_path=./certs/server.key
cors_origin=https://your-domain.com

[Cluster]
cluster_secret=your_cluster_secret
heartbeat_interval=30
node_timeout=300
```

#### 启动命令:
```bash
node scripts/deploy-master.js
```

### 2. 存储节点配置

存储节点负责文件的实际存储：

#### 配置文件: `config/storage.conf`

```ini
[Storage]
role=storage
port=5001
storage_path=./storage/files
cache_path=./storage/cache
master_host=192.168.1.100:5000

[Capacity]
max_storage=500GB
cache_size=50GB
cleanup_threshold=90

[Replication]
replication_factor=2
backup_nodes=192.168.1.101,192.168.1.102
```

#### 启动命令:
```bash
node scripts/deploy-storage.js
```

### 3. 缓存节点配置

缓存节点提供快速访问的文件缓存：

#### 配置文件: `config/cache.conf`

```ini
[Cache]
role=cache
port=5002
redis_host=localhost:6379
cache_size=100GB
ttl=3600

[Performance]
max_concurrent_transfers=10
compression_enabled=true
prefetch_enabled=true
```

### 4. 混合节点配置 (本机同时作为缓存机和存储机)

#### 配置文件: `config/hybrid.conf`

```ini
[Hybrid]
role=hybrid
master_port=5000
storage_port=5001
cache_port=5002

[Storage]
storage_path=./storage/files
max_storage=1TB

[Cache]
cache_path=./storage/cache
cache_size=200GB
redis_enabled=true

[Master]
mongodb_uri=mongodb://localhost:27017/nas_hybrid
```

## 安全性配置

### 1. SSL/TLS 配置

#### 生成SSL证书脚本: `scripts/generate-ssl.bat`

```batch
@echo off
echo 生成SSL证书...

if not exist "certs" mkdir "certs"

:: 生成私钥
openssl genrsa -out certs/server.key 2048

:: 生成证书请求
openssl req -new -key certs/server.key -out certs/server.csr -config scripts/ssl.conf

:: 生成自签名证书
openssl x509 -req -days 365 -in certs/server.csr -signkey certs/server.key -out certs/server.crt

echo SSL证书生成完成
```

### 2. 防火墙配置

#### Windows防火墙配置脚本: `scripts/firewall-setup.bat`

```batch
@echo off
echo 配置防火墙规则...

:: 允许NAS端口
netsh advfirewall firewall add rule name="NAS-Master" dir=in action=allow protocol=TCP localport=5000
netsh advfirewall firewall add rule name="NAS-Storage" dir=in action=allow protocol=TCP localport=5001
netsh advfirewall firewall add rule name="NAS-Cache" dir=in action=allow protocol=TCP localport=5002
netsh advfirewall firewall add rule name="NAS-Web" dir=in action=allow protocol=TCP localport=3000

:: 限制来源IP（可选）
:: netsh advfirewall firewall add rule name="NAS-Restricted" dir=in action=allow protocol=TCP localport=5000 remoteip=192.168.1.0/24

echo 防火墙配置完成
```

### 3. 用户权限控制

系统支持三级用户权限：

- **Prime Admin**: 最高级管理员，可管理所有用户和系统
- **Admin**: 管理员，可管理普通用户
- **Normal**: 普通用户，只能管理自己的文件

## 运行维护脚本

### 1. 健康检查脚本: `scripts/health-check.bat`

```batch
@echo off
echo 系统健康检查...

:: 检查服务状态
echo 检查服务状态...
curl -s http://localhost:5000/api/health > nul
if %errorlevel% equ 0 (
    echo [✓] 主控服务正常
) else (
    echo [✗] 主控服务异常
)

:: 检查磁盘空间
echo 检查磁盘空间...
for /f "tokens=3" %%a in ('dir /-c %SystemDrive%\ ^| find "可用"') do set free_space=%%a
echo 可用空间: %free_space%

:: 检查内存使用
echo 检查内存使用...
wmic OS get TotalVisibleMemorySize,FreePhysicalMemory /format:list

:: 检查网络连接
echo 检查网络连接...
ping -n 1 localhost > nul
if %errorlevel% equ 0 (
    echo [✓] 网络连接正常
) else (
    echo [✗] 网络连接异常
)
```

### 2. 自动备份脚本: `scripts/backup.bat`

```batch
@echo off
set backup_dir=backup\%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%
set backup_dir=%backup_dir: =0%

echo 开始备份到: %backup_dir%

if not exist "backup" mkdir "backup"
mkdir "%backup_dir%"

:: 备份配置文件
xcopy "config\*" "%backup_dir%\config\" /S /I /Y

:: 备份用户数据
xcopy "storage\users\*" "%backup_dir%\users\" /S /I /Y

:: 备份数据库
mongodump --uri="mongodb://localhost:27017/nas" --out="%backup_dir%\database"

:: 压缩备份
powershell "Compress-Archive -Path '%backup_dir%' -DestinationPath '%backup_dir%.zip'"
rmdir /S /Q "%backup_dir%"

echo 备份完成: %backup_dir%.zip
```

### 3. 日志清理脚本: `scripts/cleanup-logs.bat`

```batch
@echo off
echo 清理系统日志...

:: 删除30天前的日志
forfiles /p "logs" /s /m *.log /d -30 /c "cmd /c del @path"

:: 清理临时文件
del /Q /S "storage\temp\*" 2>nul

:: 清理过期缓存
node scripts/cleanup-cache.js

echo 日志清理完成
```

### 4. 性能监控脚本: `scripts/monitor.bat`

```batch
@echo off
:loop

echo %date% %time% - 性能监控报告
echo =====================================

:: CPU使用率
for /f "skip=1" %%p in ('wmic cpu get loadpercentage /value') do (
    if "%%p"=="" goto cpu_done
    set %%p
)
:cpu_done
echo CPU使用率: %LoadPercentage%%%

:: 内存使用率
for /f "skip=1" %%p in ('wmic OS get TotalVisibleMemorySize /value') do (
    if "%%p"=="" goto mem1_done
    set %%p
)
:mem1_done

for /f "skip=1" %%p in ('wmic OS get FreePhysicalMemory /value') do (
    if "%%p"=="" goto mem2_done
    set %%p
)
:mem2_done

set /a memory_usage=100-(%FreePhysicalMemory%*100/%TotalVisibleMemorySize%)
echo 内存使用率: %memory_usage%%%

:: 磁盘I/O
echo 磁盘信息:
wmic logicaldisk get size,freespace,caption

echo =====================================
timeout /t 60 /nobreak
goto loop
```

## 分布式部署步骤

### 1. 准备环境

在每台物理机上：

```bash
# 安装Node.js和依赖
npm install -g pm2  # 进程管理器

# 克隆项目
git clone <repository-url>
cd NAS

# 安装依赖
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 2. 配置节点

根据机器角色编辑对应配置文件：

```bash
# 主控节点
cp config/master.conf.example config/master.conf
# 编辑config/master.conf

# 存储节点
cp config/storage.conf.example config/storage.conf
# 编辑config/storage.conf

# 缓存节点
cp config/cache.conf.example config/cache.conf
# 编辑config/cache.conf
```

### 3. 启动集群

按以下顺序启动：

```bash
# 1. 启动主控节点
scripts/deploy-master.bat

# 2. 启动存储节点
scripts/deploy-storage.bat

# 3. 启动缓存节点
scripts/deploy-cache.bat

# 4. 启动负载均衡器
scripts/deploy-loadbalancer.bat
```

### 4. 验证部署

```bash
# 检查集群状态
scripts/cluster-status.bat

# 运行健康检查
scripts/health-check.bat
```

## 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 查找占用端口的进程
   netstat -ano | findstr :5000
   # 终止进程
   taskkill /PID <PID> /F
   ```

2. **MongoDB连接失败**
   ```bash
   # 检查MongoDB服务
   sc query MongoDB
   # 启动MongoDB服务
   net start MongoDB
   ```

3. **磁盘空间不足**
   ```bash
   # 运行清理脚本
   scripts/cleanup-logs.bat
   ```

4. **节点无法加入集群**
   - 检查网络连接
   - 验证集群密钥
   - 查看防火墙设置

## 监控和维护

### 性能监控

- 使用 `scripts/monitor.bat` 进行实时监控
- 配置邮件告警系统
- 使用Grafana+Prometheus进行可视化监控（可选）

### 定期维护任务

#### 每日任务
- 运行健康检查: `scripts/health-check.bat`
- 清理临时文件: `scripts/cleanup-logs.bat`

#### 每周任务
- 完整备份: `scripts/backup.bat`
- 性能分析: `scripts/performance-report.bat`

#### 每月任务
- 系统更新检查
- 安全审计
- 容量规划评估

## 安全建议

1. **网络安全**
   - 使用HTTPS/SSL
   - 配置防火墙白名单
   - 定期更新证书

2. **访问控制**
   - 强密码策略
   - 多因素认证（推荐）
   - 定期权限审查

3. **数据安全**
   - 定期备份验证
   - 数据加密存储
   - 版本控制

4. **系统安全**
   - 及时安装安全补丁
   - 监控异常访问
   - 日志审计

## API文档

### 认证接口

- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/verify` - 验证token

### 文件接口

- `GET /api/files` - 获取文件列表
- `POST /api/files/upload` - 上传文件
- `DELETE /api/files/:id` - 删除文件
- `GET /api/files/download/:id` - 下载文件

### 管理接口

- `GET /api/users` - 获取用户列表（管理员）
- `DELETE /api/users/:id` - 删除用户（管理员）
- `PUT /api/users/:id/role` - 修改用户权限（管理员）

## 技术支持

如遇问题，请参考：

1. 查看日志文件: `logs/`
2. 运行诊断脚本: `scripts/diagnose.bat`
3. 检查系统状态: `scripts/system-status.bat`

## 版本更新

### 更新步骤

1. 备份现有数据: `scripts/backup.bat`
2. 停止服务: `stop.bat`
3. 更新代码: `git pull origin main`
4. 更新依赖: `npm install`
5. 重启服务: `start.bat`

## 许可证

本项目采用 MIT 许可证。
