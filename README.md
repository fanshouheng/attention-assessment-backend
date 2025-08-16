# 儿童专注力测评系统 - 后端

Express API 服务，提供 License 验证和使用统计。

## 部署
- 平台：Railway
- 数据库：SQLite/PostgreSQL
- API 端点：https://your-api.railway.app

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