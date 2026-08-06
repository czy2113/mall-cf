// src/routers/auth.js
import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { signUser, signAdmin, verifyToken } from '../auth.js';
import { getRow, insertId, run, getDB } from '../db.js';

const r = new Hono();

// 顾客注册
r.post('/customer/register', async (c) => {
  const db = getDB(c);
  const { phone, password, name } = await c.req.json().catch(() => ({}));
  if (!phone || !/^\d{6,20}$/.test(phone)) return c.json({ error: '请输入有效的手机号' }, 400);
  if (!password || password.length < 6) return c.json({ error: '密码至少 6 位' }, 400);
  if (await getRow(db, 'SELECT id FROM users WHERE phone=?', [phone])) return c.json({ error: '该手机号已注册' }, 409);
  const hash = bcrypt.hashSync(password, 10);
  const id = await insertId(db, 'INSERT INTO users (phone, password_hash, name) VALUES (?,?,?)', [phone, hash, name || '']);
  const user = await getRow(db, 'SELECT id, phone, name, avatar, created_at FROM users WHERE id=?', [id]);
  await run(db, 'INSERT INTO customer_profiles (user_id) VALUES (?)', [user.id]);
  return c.json({ token: await signUser(c, user), user });
});

// 顾客登录
r.post('/customer/login', async (c) => {
  const db = getDB(c);
  const { phone, password } = await c.req.json().catch(() => ({}));
  const user = await getRow(db, 'SELECT * FROM users WHERE phone=?', [phone]);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) return c.json({ error: '手机号或密码错误' }, 401);
  const safe = { id: user.id, phone: user.phone, name: user.name, avatar: user.avatar, created_at: user.created_at };
  return c.json({ token: await signUser(c, safe), user: safe });
});

// 商家登录
r.post('/admin/login', async (c) => {
  const db = getDB(c);
  const { username, password } = await c.req.json().catch(() => ({}));
  const admin = await getRow(db, 'SELECT * FROM admins WHERE username=?', [username]);
  if (!admin || !bcrypt.compareSync(password || '', admin.password_hash)) return c.json({ error: '账号或密码错误' }, 401);
  const safe = { id: admin.id, username: admin.username, name: admin.name };
  return c.json({ token: await signAdmin(c, safe), admin: safe });
});

// 当前顾客信息
r.get('/customer/me', async (c) => {
  const db = getDB(c);
  const h = c.req.header('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const jwt = await verifyToken(c, token);
  if (!jwt || jwt.role !== 'user') return c.json({ error: '未登录' }, 401);
  const user = await getRow(db, 'SELECT id, phone, name, avatar, created_at FROM users WHERE id=?', [jwt.sub]);
  return c.json({ user });
});

export default r;
