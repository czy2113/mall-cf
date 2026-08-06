// src/routers/customers.js —— 商家视角客户管理
import { Hono } from 'hono';
import { getDB, getRow, allRows } from '../db.js';
import { requireAdmin } from '../auth.js';

const r = new Hono();
r.use('*', requireAdmin);

// 客户列表（含消费统计），支持等级/关键词过滤
r.get('/', async (c) => {
  const db = getDB(c);
  const keyword = c.req.query('keyword');
  const level = c.req.query('level');
  const page = Number(c.req.query('page') || 1);
  const pageSize = Number(c.req.query('pageSize') || 20);
  const where = [];
  const params = [];
  if (keyword) { where.push('(u.phone LIKE ? OR u.name LIKE ?)'); params.push('%' + keyword + '%', '%' + keyword + '%'); }
  if (level) { where.push('cp.level=?'); params.push(level); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const totalRow = await db.prepare(
    `SELECT COUNT(*) c FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id ${w}`
  ).bind(...params).first();
  const rows = await db.prepare(
    `SELECT u.id, u.phone, u.name, u.avatar, u.created_at,
      COALESCE(cp.level,'normal') level, cp.note, cp.tags, COALESCE(cp.accumulated_spent,0) accumulated_spent, COALESCE(cp.order_count,0) order_count
      FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id ${w} ORDER BY u.id DESC LIMIT ? OFFSET ?`
  ).bind(...params, pageSize, (page - 1) * pageSize).all();
  const items = rows.results.map((rr) => ({ ...rr, accumulated_spent: rr.accumulated_spent / 100 }));
  return c.json({ total: totalRow.c, items });
});

// 客户详情
r.get('/:id', async (c) => {
  const db = getDB(c);
  const u = await db.prepare(
    `SELECT u.id, u.phone, u.name, u.avatar, u.created_at,
      COALESCE(cp.level,'normal') level, cp.note, cp.tags, COALESCE(cp.accumulated_spent,0) accumulated_spent, COALESCE(cp.order_count,0) order_count
      FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id WHERE u.id=?`
  ).bind(c.req.param('id')).first();
  if (!u) return c.json({ error: '客户不存在' }, 404);
  u.accumulated_spent = u.accumulated_spent / 100;
  u.orders = await allRows(db, 'SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 20', [u.id]);
  return c.json(u);
});

// 更新客户档案（等级/备注/标签）
r.put('/:id', async (c) => {
  const db = getDB(c);
  const { level, note, tags } = await c.req.json().catch(() => ({}));
  await db.prepare(
    `INSERT INTO customer_profiles (user_id, level, note, tags) VALUES (?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET level=excluded.level, note=excluded.note, tags=excluded.tags`
  ).bind(c.req.param('id'), level || 'normal', note || '', tags || '').run();
  return c.json({ ok: true });
});

export default r;
