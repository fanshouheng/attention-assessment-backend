# Zeabur 部署指南

## 快速部署步骤

### 1. 准备代码仓库
确保你的代码已推送到 GitHub 仓库。

### 2. 登录 Zeabur
访问 [Zeabur](https://zeabur.com) 并登录你的账号。

### 3. 创建新项目
1. 点击 "New Project"
2. 选择 "Deploy from GitHub"
3. 选择你的仓库

### 4. 配置环境变量
在 Zeabur 项目设置中添加以下环境变量：

**必需的环境变量：**
- `JWT_SECRET`: 用于JWT签名的密钥（建议使用32位随机字符串）
- `ADMIN_USERNAME`: 管理员用户名
- `ADMIN_PASSWORD`: 管理员密码

**可选的环境变量：**
- `CORS_ORIGIN`: 前端域名，如 `https://your-frontend.vercel.app`
- `NODE_ENV`: 默认为 `production`
- `PORT`: 默认为 `3001`

### 5. 部署
Zeabur 会自动检测到 `Dockerfile` 并开始构建部署。

## 环境变量示例

```bash
JWT_SECRET=abcd1234efgh5678ijkl9012mnop3456
ADMIN_USERNAME=admin
ADMIN_PASSWORD=SecurePassword123!
CORS_ORIGIN=https://your-frontend.vercel.app
```

## 部署后验证

1. 访问你的 Zeabur 应用 URL
2. 应该会重定向到管理页面
3. 使用设置的管理员账号登录
4. 测试 API 端点：`GET /health`

## 数据持久化

Zeabur 会自动为你的应用提供持久化存储，SQLite 数据库文件会保存在 `/app/data/` 目录中。

## 故障排除

### 常见问题：
1. **应用无法启动**: 检查环境变量是否正确设置
2. **数据库错误**: 确保 `/app/data` 目录有写入权限
3. **CORS 错误**: 检查 `CORS_ORIGIN` 环境变量设置

### 查看日志：
在 Zeabur 控制台的 "Logs" 标签页查看应用日志。

## API 端点

部署成功后，你的 API 将在以下端点可用：

- `GET /health` - 健康检查
- `POST /api/validate-license` - License验证
- `POST /api/usage-stats` - 使用统计
- `POST /api/admin/login` - 管理员登录
- `POST /api/admin/create-license` - 创建License
- `GET /api/admin/licenses` - 获取License列表
- `GET /api/admin/statistics` - 统计数据

## 安全建议

1. 使用强密码作为管理员密码
2. 定期更换 JWT_SECRET
3. 设置正确的 CORS_ORIGIN 限制跨域访问
4. 定期备份数据库文件