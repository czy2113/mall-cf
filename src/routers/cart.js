// src/routers/cart.js —— 服务端购物车（与用户绑定，跨设备实时同步）
import { Hono } from 'hono';
import { getDB, getRow, allRows } from '../db.js';
import { requireUser } from '../auth.js';

const r = new Hono();
r.use('*', requireUser);

async function view(db, userId) {
  const rows = await db.prepare(
    `SELECT ci.product_id, ci.quantity, p.name, p.price, p.image_url, p.status,
      (SELECT quantity FROM inventory WHERE product_id=ci.product_id) AS stock
      FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.user_id=?`
  ).bind(userId).all();
  let total = 0;
  const items = rows.results.map((rr) => {
    const subtotal = rr.price * rr.quantity;
    total += subtotal;
    return {
      product_id: rr.product_id, name: rr.name, price: rr.price / 100, image_url: rr.image_url,
      status: rr.status, stock: rr.stock || 0, quantity: rr.quantity, subtotal: subtotal / 100,
    };
  });
  return { items, total: total / 100, count: rows.results.length };
}

r.get('/', async (c) => c.json(await view(getDB(c), c.get('user').sub)));

r.post('/add', async (c) => {
  const db = getDB(c);
  const uid = c.get('user').sub;
  const { product_id, quantity = 1 } = await c.req.json().catch(() => ({}));
  const p = await getRow(db, 'SELECT id, status FROM products WHERE id=?', [product_id]);
  if (!p || p.status !== 'on') return c.json({ error: '商品不可用' }, 400);
  const inv = await getRow(db, 'SELECT quantity FROM inventory WHERE product_id=?', [product_id]);
  const stock = inv ? inv.quantity : 0;
  if (stock < quantity) return c.json({ error: '库存不足' }, 400);
  await db.prepare(
    `INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?,?,?)
     ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`
  ).bind(uid, product_id, Number(quantity)).run();
  return c.json(await view(db, uid));
});

r.put('/item/:product_id', async (c) => {
  const db = getDB(c);
  const uid = c.get('user').sub;
  const pid = c.req.param('product_id');
  const { quantity } = await c.req.json().catch(() => ({}));
  if (Number(quantity) <= 0) {
    await db.prepare('DELETE FROM cart_items WHERE user_id=? AND product_id=?').bind(uid, pid).run();
  } else {
    await db.prepare('UPDATE cart_items SET quantity=? WHERE user_id=? AND product_id=?').bind(Number(quantity), uid, pid).run();
  }
  return c.json(await view(db, uid));
});

r.delete('/item/:product_id', async (c) => {
  const db = getDB(c);
  const uid = c.get('user').sub;
  await db.prepare('DELETE FROM cart_items WHERE user_id=? AND product_id=?').bind(uid, c.req.param('product_id')).run();
  return c.json(await view(db, uid));
});

r.delete('/', async (c) => {
  const db = getDB(c);
  const uid = c.get('user').sub;
  await db.prepare('DELETE FROM cart_items WHERE user_id=?').bind(uid).run();
  return c.json(await view(db, uid));
});

export default r;
