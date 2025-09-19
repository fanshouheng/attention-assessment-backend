# 儿童专注力测评系统 - 后端

Express API 服务，提供 License 验证和使用统计。

## 部署

### Zeabur 部署
1. 推送代码到 GitHub 仓库
2. 在 Zeabur 控制台创建新项目
3. 连接 GitHub 仓库
4. 配置环境变量：
   - `JWT_SECRET`: JWT密钥
   - `ADMIN_USERNAME`: 管理员用户名
   - `ADMIN_PASSWORD`: 管理员密码
   - `CORS_ORIGIN`: 前端域名（可选）
5. 部署完成后访问：https://your-project.zeabur.app

### 本地部署
- 平台：Railway/Zeabur
- 数据库：SQLite
- API 端点：https://your-project.zeabur.app

## 开发
```bash
cd server
npm install
npm start
```

## API 端点
- `POST /api/validate-license` - License验证
- `POST /api/usage-stats` - 使用统计
- `POST /api/admin/create-license` - 创建License（管理员）

## 环境变量
复制 `.env.example` 为 `.env` 并配置：
- `NODE_ENV`: 运行环境
- `PORT`: 服务端口
- `DATABASE_URL`: 数据库连接
- `CORS_ORIGIN`: 前端域名
- `JWT_SECRET`: JWT密钥