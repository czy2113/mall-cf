// src/worker.js —— Cloudflare Workers 入口（Hono）
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import auth from './routers/auth.js';
import products from './routers/products.js';
import cart from './routers/cart.js';
import orders from './routers/orders.js';
import customers from './routers/customers.js';
import inventory from './routers/inventory.js';
import stats from './routers/stats.js';
import payments from './routers/payments.js';
import settings from './routers/settings.js';
import { ensureSchema } from './schema.js';

const app = new Hono();

// 允许跨域（顾客端/商家端同源，这里放宽以便调试与未来多端接入）
app.use('*', cors());

// API 请求前自动确保 D1 表结构与种子数据就绪（仅首次/冷启动执行一次）
app.use('/api/*', async (c, next) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: '数据库尚未绑定：请到 Cloudflare 后台 Worker 设置中添加 D1 绑定(DB → mall_db)' }, 500);
  }
  try {
    await ensureSchema(db);
  } catch (e) {
    return c.json({ error: '数据库初始化失败：' + (e && e.message ? e.message : String(e)) }, 500);
  }
  await next();
});

// API 路由
app.route('/api/auth', auth);
app.route('/api/products', products);
app.route('/api/cart', cart);
app.route('/api/orders', orders);
app.route('/api/customers', customers);
app.route('/api/inventory', inventory);
app.route('/api/stats', stats);
app.route('/api/payment', payments);
app.route('/api/settings', settings);

// 健康检查
app.get('/api/health', (c) => c.json({ ok: true, time: Date.now() }));

// 商家后台入口：/admin -> public/admin.html（assets 不会自动把 /admin 映射到 admin.html）
app.get('/admin', async (c) => {
  const origin = new URL(c.req.url).origin;
  const res = await c.env.ASSETS.fetch(new Request(origin + '/admin.html', c.req.raw));
  return res;
});

// 根路径交由静态资源（public/index.html）托管，不再用 JSON 兜底，避免盖掉顾客端首页

// 兜底：所有未匹配的请求（如 / 、/index.html 、/customer.css 、/customer.js 等）
// 都交给 [assets] 静态资源处理，确保顾客端首页与静态文件能正常打开
app.all('*', async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
