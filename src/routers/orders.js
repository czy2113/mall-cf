// src/routers/orders.js
import { Hono } from 'hono';
import { getDB, getRow, allRows, insertId, genOrderNo } from '../db.js';
import { requireUser, requireAdmin, verifyToken } from '../auth.js';
import { createPayment, confirmPayment, refundPayment } from '../payments.js';

const r = new Hono();

async function detail(db, orderId) {
  const o = await getRow(db, 'SELECT * FROM orders WHERE id=?', [orderId]);
  if (!o) return null;
  const items = await allRows(db, 'SELECT * FROM order_items WHERE order_id=?', [orderId]);
  const pay = o.payment_id ? await getRow(db, 'SELECT * FROM payments WHERE id=?', [o.payment_id]) : null;
  return {
    ...o, total_amount: o.total_amount / 100, items,
    payment: pay ? { id: pay.id, method: pay.method, status: pay.status } : null,
  };
}

// 创建订单：支持「从购物车结算」或「直接带商品列表」
r.post('/', requireUser, async (c) => {
  const db = getDB(c);
  const uid = c.get('user').sub;
  const body = await c.req.json().catch(() => ({}));
  const { from_cart, items: reqItems, address, receiver_name, receiver_phone, remark } = body;
  let items = reqItems || [];
  if (from_cart) {
    const rows = await db.prepare(
      'SELECT ci.product_id, ci.quantity, p.price FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.user_id=?'
    ).bind(uid).all();
    items = rows.results.map((i) => ({ product_id: i.product_id, quantity: i.quantity, price: i.price }));
  }
  if (!items.length) return c.json({ error: '购物车为空' }, 400);

  // 校验库存并算总价
  let total = 0;
  const lines = [];
  for (const it of items) {
    const p = await getRow(db, 'SELECT id, name, price, status FROM products WHERE id=?', [it.product_id]);
    if (!p || p.status !== 'on') return c.json({ error: '商品不可用: ' + (p ? p.name : it.product_id) }, 400);
    const inv = await getRow(db, 'SELECT quantity FROM inventory WHERE product_id=?', [it.product_id]);
    const stock = inv ? inv.quantity : 0;
    if (stock < it.quantity) return c.json({ error: '库存不足: ' + p.name }, 400);
    const subtotal = p.price * it.quantity;
    total += subtotal;
    lines.push({ product_id: p.id, name: p.name, price: p.price, quantity: it.quantity, subtotal });
  }

  const orderNo = genOrderNo();
  const info = await db.prepare(
    'INSERT INTO orders (order_no, user_id, status, total_amount, address, receiver_name, receiver_phone, remark) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(orderNo, uid, 'pending', total, address || '', receiver_name || '', receiver_phone || '', remark || '').run();
  const orderId = Number(info.meta.last_row_id);
  for (const l of lines) {
    await db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity, subtotal) VALUES (?,?,?,?,?,?)')
      .bind(orderId, l.product_id, l.name, l.price, l.quantity, l.subtotal).run();
  }
  if (from_cart) await db.prepare('DELETE FROM cart_items WHERE user_id=?').bind(uid).run();

  const pay = await createPayment(db, { orderId, method: body.payment_method, amount: total });
  return c.json({ order_id: orderId, order_no: orderNo, total: total / 100, payment: { payment_id: pay.paymentId, method: pay.method } });
});

// 顾客：我的订单
r.get('/mine', requireUser, async (c) => {
  const db = getDB(c);
  const rows = await db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').bind(c.get('user').sub).all();
  const list = [];
  for (const o of rows.results) {
    list.push({ ...o, total_amount: o.total_amount / 100, items: await allRows(db, 'SELECT * FROM order_items WHERE order_id=?', [o.id]) });
  }
  return c.json({ items: list });
});

// 顾客：订单查询（按订单号，演示用）
r.get('/query', async (c) => {
  const db = getDB(c);
  const order_no = c.req.query('order_no');
  const o = await getRow(db, 'SELECT * FROM orders WHERE order_no=?', [order_no]);
  if (!o) return c.json({ error: '订单不存在' }, 404);
  return c.json(await detail(db, o.id));
});

// 商家：订单列表（可过滤状态）
r.get('/', requireAdmin, async (c) => {
  const db = getDB(c);
  const status = c.req.query('status');
  const page = Number(c.req.query('page') || 1);
  const pageSize = Number(c.req.query('pageSize') || 20);
  const where = status ? 'WHERE status=?' : '';
  const params = status ? [status] : [];
  const totalRow = await db.prepare(`SELECT COUNT(*) c FROM orders ${where}`).bind(...params).first();
  const rows = await db.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .bind(...params, pageSize, (page - 1) * pageSize).all();
  const list = [];
  for (const o of rows.results) {
    list.push({ ...o, total_amount: o.total_amount / 100, items: await allRows(db, 'SELECT * FROM order_items WHERE order_id=?', [o.id]) });
  }
  return c.json({ total: totalRow.c, items: list });
});

// 订单详情（顾客仅可看自己的；商家可看全部）
r.get('/:id', async (c) => {
  const db = getDB(c);
  const h = c.req.header('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const jwt = await verifyToken(c, token);
  if (!jwt) return c.json({ error: '未登录' }, 401);
  const d = await detail(db, Number(c.req.param('id')));
  if (!d) return c.json({ error: '订单不存在' }, 404);
  if (jwt.role === 'user' && d.user_id !== jwt.sub) return c.json({ error: '无权查看' }, 403);
  return c.json(d);
});

// 商家：更新订单状态
r.put('/:id/status', requireAdmin, async (c) => {
  const db = getDB(c);
  const id = c.req.param('id');
  const { status } = await c.req.json().catch(() => ({}));
  const allowed = ['paid', 'shipped', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return c.json({ error: '非法状态' }, 400);
  const o = await getRow(db, 'SELECT * FROM orders WHERE id=?', [id]);
  if (!o) return c.json({ error: '订单不存在' }, 404);
  await db.prepare("UPDATE orders SET status=?, updated_at=datetime('now') WHERE id=?").bind(status, id).run();
  // 取消时恢复库存
  if (status === 'cancelled' && o.status === 'paid') {
    const items = await allRows(db, 'SELECT product_id, quantity FROM order_items WHERE order_id=?', [o.id]);
    for (const it of items) {
      await db.prepare("UPDATE inventory SET quantity=quantity+?, updated_at=datetime('now') WHERE product_id=?").bind(it.quantity, it.product_id).run();
    }
  }
  return c.json(await detail(db, Number(id)));
});

// 商家：退款
r.post('/:id/refund', requireAdmin, async (c) => {
  const db = getDB(c);
  try { return c.json(await refundPayment(db, Number(c.req.param('id')))); }
  catch (e) { return c.json({ error: e.message }, 400); }
});

export default r;
