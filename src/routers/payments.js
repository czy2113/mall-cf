// src/routers/payments.js
import { Hono } from 'hono';
import { getDB, getRow } from '../db.js';
import { requireUser } from '../auth.js';
import { createPayment, confirmPayment } from '../payments.js';
import { DEFAULT_PAYMENT_METHOD } from '../config.js';

const r = new Hono();

// 创建支付（顾客发起）
r.post('/create', requireUser, async (c) => {
  const db = getDB(c);
  const uid = c.get('user').sub;
  const { order_id, method } = await c.req.json().catch(() => ({}));
  const order = await getRow(db, 'SELECT * FROM orders WHERE id=?', [order_id]);
  if (!order) return c.json({ error: '订单不存在' }, 404);
  if (order.user_id !== uid) return c.json({ error: '无权操作' }, 403);
  if (order.status !== 'pending') return c.json({ error: '订单状态不可支付' }, 400);
  const m = method || DEFAULT_PAYMENT_METHOD;
  const pay = await createPayment(db, { orderId: order.id, method: m, amount: order.total_amount });
  // 返回给前端如何继续支付
  let action;
  if (m === 'mock') action = { type: 'mock', url: '/api/payment/confirm' };
  else if (m === 'stripe') action = { type: 'redirect', url: `https://checkout.stripe.com/c/pay/${pay.paymentId}#demo` };
  else action = { type: 'redirect', url: `/pay/${pay.paymentId}` }; // 微信/支付宝由前端渲染二维码占位
  return c.json({ payment_id: pay.paymentId, method: m, amount: order.total_amount / 100, action });
});

// 模拟支付确认（mock 模式，前端“确认支付”按钮调用）
r.post('/confirm', requireUser, async (c) => {
  const db = getDB(c);
  const uid = c.get('user').sub;
  const { payment_id } = await c.req.json().catch(() => ({}));
  const p = await getRow(db, 'SELECT * FROM payments WHERE id=?', [payment_id]);
  if (!p) return c.json({ error: '支付单不存在' }, 404);
  const order = await getRow(db, 'SELECT * FROM orders WHERE id=?', [p.order_id]);
  if (order.user_id !== uid) return c.json({ error: '无权操作' }, 403);
  try {
    const rr = await confirmPayment(db, payment_id);
    return c.json({ ok: true, order: rr.order || order, already: rr.already });
  } catch (e) { return c.json({ error: e.message }, 400); }
});

// 真实网关回调（预留：Stripe / 微信 / 支付宝 异步通知）
r.post('/webhook/:method', async (c) => c.json({ received: true }));

export default r;
