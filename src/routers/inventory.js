// src/routers/inventory.js —— 库存管理
import { Hono } from 'hono';
import { getDB, getRow, allRows } from '../db.js';
import { requireAdmin } from '../auth.js';

const r = new Hono();
r.use('*', requireAdmin);

// 库存列表（含预警）
r.get('/', async (c) => {
  const db = getDB(c);
  const rows = await db.prepare(
    `SELECT p.id, p.name, p.status, i.quantity, i.warn_threshold
     FROM products p LEFT JOIN inventory i ON i.product_id=p.id ORDER BY p.id`
  ).all();
  const items = rows.results.map((rr) => ({ ...rr, low_stock: rr.quantity <= rr.warn_threshold }));
  return c.json({ items });
});

// 调整库存（set 直接设值 / delta 增减）
r.put('/:product_id', async (c) => {
  const db = getDB(c);
  const pid = c.req.param('product_id');
  const { quantity, delta, warn_threshold } = await c.req.json().catch(() => ({}));
  const exists = await getRow(db, 'SELECT * FROM inventory WHERE product_id=?', [pid]);
  if (!exists) await db.prepare('INSERT INTO inventory (product_id, quantity, warn_threshold) VALUES (?,?,?)').bind(pid, 0, 10).run();
  if (delta !== undefined) {
    await db.prepare("UPDATE inventory SET quantity = quantity + ?, updated_at=datetime('now') WHERE product_id=?").bind(Number(delta), pid).run();
  } else if (quantity !== undefined) {
    await db.prepare("UPDATE inventory SET quantity=?, updated_at=datetime('now') WHERE product_id=?").bind(Number(quantity), pid).run();
  }
  if (warn_threshold !== undefined) {
    await db.prepare("UPDATE inventory SET warn_threshold=? WHERE product_id=?").bind(Number(warn_threshold), pid).run();
  }
  const inv = await getRow(db, 'SELECT * FROM inventory WHERE product_id=?', [pid]);
  return c.json({ ok: true, inventory: inv });
});

export default r;
