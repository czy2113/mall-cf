// src/routers/settings.js —— 店铺设置（公开读取 + 商家修改）
import { Hono } from 'hono';
import { getDB, allSettings, setSetting } from '../db.js';
import { requireAdmin } from '../auth.js';

const r = new Hono();

// 公开：顾客端读取店铺信息
r.get('/', async (c) => {
  const db = getDB(c);
  const s = await allSettings(db);
  return c.json({
    shop_name: s.shop_name, announcement: s.announcement, contact_phone: s.contact_phone,
    shop_logo: s.shop_logo, payment_method: s.payment_method,
  });
});

// 商家：更新设置
r.put('/', requireAdmin, async (c) => {
  const db = getDB(c);
  const { shop_name, announcement, contact_phone, shop_logo, payment_method } = await c.req.json().catch(() => ({}));
  if (shop_name !== undefined) await setSetting(db, 'shop_name', shop_name);
  if (announcement !== undefined) await setSetting(db, 'announcement', announcement);
  if (contact_phone !== undefined) await setSetting(db, 'contact_phone', contact_phone);
  if (shop_logo !== undefined) await setSetting(db, 'shop_logo', shop_logo);
  if (payment_method !== undefined) await setSetting(db, 'payment_method', payment_method);
  const s = await allSettings(db);
  return c.json({ ok: true, settings: s });
});

export default r;
