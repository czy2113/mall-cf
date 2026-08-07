// src/app.js —— 应用入口（与平台无关的核心 Hono 应用）
// 原本在 Cloudflare Workers 的 worker.js 里，现提取为独立模块，
// 去掉所有 Cloudflare 特有逻辑（c.env.DB / c.env.ASSETS / 静态兜底），
// 由 Vercel 入口 api/[[...]].js 引用。静态资源（/、/admin、*.css、*.js）
// 交给 Vercel 的 public/ 静态托管，本文件只负责 /api/* 路由。
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
import { getDB } from './db.js';
import { ensureSchema } from './schema.js';

const app = new Hono();

// 允许跨域（顾客端/商家端同源，这里放宽以便调试与未来多端接入）
app.use('*', cors());

// API 请求前自动确保数据库表结构与种子数据就绪（仅首次/冷启动执行一次）
app.use('/api/*', async (c, next) => {
  try {
    const db = getDB(c);
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

export default app;
