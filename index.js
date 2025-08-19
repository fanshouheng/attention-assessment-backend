const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();

// 中间件配置
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());

// 静态文件服务 - 提供管理页面
app.use(express.static('.'));

// 数据库初始化
const db = new sqlite3.Database(process.env.DB_PATH || 'licenses.db');

// 创建数据库表
db.serialize(() => {
  // License表
  db.run(`CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,
    user_name TEXT NOT NULL,
    user_email TEXT NOT NULL,
    daily_limit INTEGER DEFAULT 10,
    monthly_limit INTEGER DEFAULT 300,
    expiry_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
  )`);

  // 使用记录表
  db.run(`CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY(license_key) REFERENCES licenses(license_key)
  )`);

  // 管理员表
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 创建默认管理员账号
  const defaultAdmin = process.env.ADMIN_USERNAME || 'admin';
  const defaultPassword = process.env.ADMIN_PASSWORD || generateSecurePassword();
  
  bcrypt.hash(defaultPassword, 10, (err, hash) => {
    if (err) {
      console.error('创建管理员密码哈希失败:', err);
      return;
    }
    
    db.run(`INSERT OR IGNORE INTO admins (username, password_hash) VALUES (?, ?)`,
      [defaultAdmin, hash], (err) => {
        if (err) {
          console.error('创建默认管理员失败:', err);
        } else {
          console.log(`默认管理员账号: ${defaultAdmin}`);
          if (!process.env.ADMIN_PASSWORD) {
            console.log(`默认管理员密码: ${defaultPassword}`);
            console.log(`⚠️  请及时修改默认密码！`);
          }
        }
      });
  });

  // 生产环境不创建演示License
  if (process.env.NODE_ENV !== 'production') {
    const demoLicense = 'DEMO-TRIAL-2024-ABCD';
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7); // 7天有效期
    
    db.run(`INSERT OR IGNORE INTO licenses 
      (license_key, user_name, user_email, daily_limit, monthly_limit, expiry_date) 
      VALUES (?, ?, ?, ?, ?, ?)`,
      [demoLicense, '演示用户', 'demo@example.com', 5, 50, expiryDate.toISOString()],
      (err) => {
        if (err) {
          console.error('创建演示License失败:', err);
        } else {
          console.log(`演示License: ${demoLicense}`);
        }
      });
  }
});

// License验证接口
app.post('/api/validate-license', (req, res) => {
  const { licenseKey } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || '';

  if (!licenseKey) {
    return res.status(400).json({ 
      valid: false, 
      message: 'License密钥不能为空' 
    });
  }

  db.get(`SELECT * FROM licenses WHERE license_key = ? AND is_active = 1`, 
    [licenseKey], (err, row) => {
    if (err) {
      console.error('数据库查询错误:', err);
      return res.status(500).json({ 
        valid: false, 
        message: '服务器内部错误' 
      });
    }
    
    if (!row) {
      // 记录无效尝试
      db.run(`INSERT INTO usage_logs (license_key, action, ip_address, user_agent) 
        VALUES (?, ?, ?, ?)`,
        [licenseKey, 'invalid_attempt', clientIP, userAgent]);
      
      return res.json({ 
        valid: false, 
        message: 'License密钥无效' 
      });
    }
    
    // 检查过期时间
    if (row.expiry_date && new Date(row.expiry_date) < new Date()) {
      return res.json({ 
        valid: false, 
        message: 'License已过期' 
      });
    }
    
    // 记录成功验证
    db.run(`INSERT INTO usage_logs (license_key, action, ip_address, user_agent) 
      VALUES (?, ?, ?, ?)`,
      [licenseKey, 'login_success', clientIP, userAgent]);
    
    res.json({
      valid: true,
      userInfo: {
        name: row.user_name,
        email: row.user_email,
        expiryDate: row.expiry_date
      },
      limits: {
        dailyReports: row.daily_limit,
        monthlyReports: row.monthly_limit
      }
    });
  });
});

// 使用统计接口
app.post('/api/usage-stats', (req, res) => {
  const { licenseKey, action } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || '';
  
  if (!licenseKey || !action) {
    return res.status(400).json({ 
      success: false, 
      message: '参数不完整' 
    });
  }

  // 验证License有效性
  db.get(`SELECT id FROM licenses WHERE license_key = ? AND is_active = 1`, 
    [licenseKey], (err, row) => {
    if (err || !row) {
      return res.status(403).json({ 
        success: false, 
        message: 'License无效' 
      });
    }

    // 记录使用统计
    db.run(`INSERT INTO usage_logs (license_key, action, ip_address, user_agent) 
      VALUES (?, ?, ?, ?)`,
      [licenseKey, action, clientIP, userAgent], (err) => {
      if (err) {
        console.error('记录使用统计失败:', err);
        return res.status(500).json({ 
          success: false, 
          message: '记录失败' 
        });
      }
      res.json({ success: true });
    });
  });
});

// 获取今日使用量
app.post('/api/daily-usage', (req, res) => {
  const { licenseKey } = req.body;
  
  if (!licenseKey) {
    return res.status(400).json({ message: '参数不完整' });
  }

  const today = new Date().toISOString().split('T')[0];
  
  db.get(`SELECT COUNT(*) as count FROM usage_logs 
    WHERE license_key = ? AND action = 'report_generated' 
    AND date(timestamp) = ?`,
    [licenseKey, today], (err, row) => {
    if (err) {
      console.error('查询今日使用量失败:', err);
      return res.status(500).json({ message: '查询失败' });
    }
    
    res.json({ dailyUsage: row.count || 0 });
  });
});

// 管理员登录
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }

  db.get(`SELECT * FROM admins WHERE username = ?`, [username], async (err, row) => {
    if (err) {
      console.error('管理员登录查询失败:', err);
      return res.status(500).json({ message: '服务器错误' });
    }
    
    if (!row) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    try {
      const passwordMatch = await bcrypt.compare(password, row.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ message: '用户名或密码错误' });
      }

      res.json({ 
        success: true, 
        message: '登录成功',
        admin: { username: row.username }
      });
    } catch (error) {
      console.error('密码验证失败:', error);
      res.status(500).json({ message: '服务器错误' });
    }
  });
});

// License管理接口（需要管理员权限）
app.post('/api/admin/create-license', (req, res) => {
  const { userName, userEmail, dailyLimit, monthlyLimit, expiryDate } = req.body;
  
  if (!userName || !userEmail) {
    return res.status(400).json({ 
      success: false, 
      message: '用户名和邮箱不能为空' 
    });
  }

  // 生成License密钥
  const licenseKey = generateLicenseKey();
  
  db.run(`INSERT INTO licenses 
    (license_key, user_name, user_email, daily_limit, monthly_limit, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [licenseKey, userName, userEmail, dailyLimit || 10, monthlyLimit || 300, expiryDate],
    function(err) {
      if (err) {
        console.error('创建License失败:', err);
        return res.status(500).json({ 
          success: false, 
          message: '创建License失败' 
        });
      }
      
      res.json({ 
        success: true,
        licenseKey, 
        message: 'License创建成功' 
      });
    });
});

// 获取License列表
app.get('/api/admin/licenses', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  db.all(`SELECT 
    id, license_key, user_name, user_email, 
    daily_limit, monthly_limit, expiry_date, 
    created_at, is_active
    FROM licenses 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?`,
    [limit, offset], (err, rows) => {
    if (err) {
      console.error('获取License列表失败:', err);
      return res.status(500).json({ message: '查询失败' });
    }

    // 获取总数
    db.get(`SELECT COUNT(*) as total FROM licenses`, (err, countRow) => {
      if (err) {
        console.error('获取License总数失败:', err);
        return res.status(500).json({ message: '查询失败' });
      }

      res.json({
        licenses: rows,
        pagination: {
          page,
          limit,
          total: countRow.total,
          pages: Math.ceil(countRow.total / limit)
        }
      });
    });
  });
});

// 管理员统计数据
app.get('/api/admin/statistics', (req, res) => {
  // 获取总License数
  db.get(`SELECT COUNT(*) as total FROM licenses`, (err, totalRow) => {
    if (err) {
      console.error('获取总License数失败:', err);
      return res.status(500).json({ success: false, message: '查询失败' });
    }

    // 获取活跃License数
    db.get(`SELECT COUNT(*) as active FROM licenses WHERE is_active = 1 AND (expiry_date IS NULL OR expiry_date > datetime('now'))`, (err, activeRow) => {
      if (err) {
        console.error('获取活跃License数失败:', err);
        return res.status(500).json({ success: false, message: '查询失败' });
      }

      // 获取今日使用量
      const today = new Date().toISOString().split('T')[0];
      db.get(`SELECT COUNT(*) as today FROM usage_logs WHERE date(timestamp) = ? AND action = 'report_generated'`, [today], (err, todayRow) => {
        if (err) {
          console.error('获取今日使用量失败:', err);
          return res.status(500).json({ success: false, message: '查询失败' });
        }

        // 获取本月使用量
        const thisMonth = new Date().toISOString().substring(0, 7);
        db.get(`SELECT COUNT(*) as month FROM usage_logs WHERE strftime('%Y-%m', timestamp) = ? AND action = 'report_generated'`, [thisMonth], (err, monthRow) => {
          if (err) {
            console.error('获取本月使用量失败:', err);
            return res.status(500).json({ success: false, message: '查询失败' });
          }

          res.json({
            success: true,
            data: {
              totalLicenses: totalRow.total,
              activeLicenses: activeRow.active,
              todayUsage: todayRow.today,
              monthUsage: monthRow.month
            }
          });
        });
      });
    });
  });
});

// 使用统计报告
app.get('/api/admin/usage-stats', (req, res) => {
  // 获取最近7天的使用统计
  db.all(`SELECT 
    DATE(timestamp) as date,
    COUNT(*) as count
    FROM usage_logs 
    WHERE action = 'report_generated' 
    AND date(timestamp) >= date('now', '-7 days')
    GROUP BY DATE(timestamp) 
    ORDER BY date DESC`, (err, weeklyRows) => {
    if (err) {
      console.error('获取周统计失败:', err);
      return res.status(500).json({ success: false, message: '查询失败' });
    }

    // 获取热门License
    db.all(`SELECT 
      l.license_key,
      l.user_name,
      COUNT(ul.id) as usage_count
      FROM licenses l
      LEFT JOIN usage_logs ul ON l.license_key = ul.license_key 
      WHERE ul.action = 'report_generated'
      AND ul.timestamp >= datetime('now', '-30 days')
      GROUP BY l.license_key, l.user_name
      ORDER BY usage_count DESC
      LIMIT 5`, (err, popularRows) => {
      if (err) {
        console.error('获取热门License失败:', err);
        return res.status(500).json({ success: false, message: '查询失败' });
      }

      // 格式化数据
      const weeklyStats = weeklyRows.length > 0 ? 
        weeklyRows.map(row => `<div class="flex justify-between"><span>${row.date}</span><span class="font-medium">${row.count}次</span></div>`).join('') :
        '<p class="text-gray-500">暂无数据</p>';

      const popularLicenses = popularRows.length > 0 ?
        popularRows.map(row => `<div class="flex justify-between"><span class="text-sm">${row.license_key.substring(0, 8)}***</span><span class="font-medium">${row.usage_count}次</span></div>`).join('') :
        '<p class="text-gray-500">暂无数据</p>';

      res.json({
        success: true,
        data: {
          weeklyStats: `<div class="space-y-2">${weeklyStats}</div>`,
          popularLicenses: `<div class="space-y-2">${popularLicenses}</div>`
        }
      });
    });
  });
});

// 生成License密钥
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) result += '-';
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 生成安全密码
function generateSecurePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// 管理页面路由
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/admin.html');
});

// 根路径重定向到管理页面
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('未处理的错误:', err);
  res.status(500).json({ 
    success: false, 
    message: '服务器内部错误' 
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: '接口不存在' 
  });
});

// 启动服务器
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`🚀 License服务器启动成功`);
  console.log(`📡 端口: ${PORT}`);
  console.log(`🌍 环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 数据库: ${process.env.DB_PATH || 'licenses.db'}`);
  console.log(`=================================`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  db.close((err) => {
    if (err) {
      console.error('关闭数据库连接失败:', err);
    } else {
      console.log('数据库连接已关闭');
    }
    process.exit(0);
  });
}); 