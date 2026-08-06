// src/payments.js —— 支付模块（可插拔：mock / stripe / wechat / alipay）
// D1 异步版：所有函数接收 db（D1Database）作为第一个参数。
import { insertId, getRow, allRows, run } from './db.js';

// 创建支付单
export async function createPayment(db, { orderId, method, amount }) {
  const m = method || 'mock';
  const id = await insertId(
    db,
    'INSERT INTO payments (order_id, method, amount, status) VALUES (?,?,?,?)',
    [orderId, m, amount, 'created']
  );
  return { paymentId: id, method: m, amount };
}

// 支付成功后的统一副作用：订单状态、扣库存、客户消费统计
export async function onPaid(db, orderId, paymentId, method, txnId) {
  const order = await getRow(db, 'SELECT * FROM orders WHERE id=?', [orderId]);
  if (!order || order.status === 'paid') return order;

  await run(db,
    "UPDATE orders SET status='paid', paid_at=datetime('now'), payment_id=?, payment_method=?, updated_at=datetime('now') WHERE id=?",
    [paymentId, method, orderId]);
  await run(db,
    "UPDATE payments SET status='paid', gateway_txn_id=?, updated_at=datetime('now') WHERE id=?",
    [txnId || ('mock_' + Date.now()), paymentId]);

  // 扣减库存
  const items = await allRows(db, 'SELECT product_id, quantity FROM order_items WHERE order_id=?', [orderId]);
  for (const it of items) {
    await run(db,
      "UPDATE inventory SET quantity = quantity - ?, updated_at=datetime('now') WHERE product_id=?",
      [it.quantity, it.product_id]);
  }

  // 更新客户消费统计
  if (order.user_id) {
    await run(db,
      `INSERT INTO customer_profiles (user_id, accumulated_spent, order_count)
       VALUES (?,?,1) ON CONFLICT(user_id) DO UPDATE SET
       accumulated_spent = accumulated_spent + excluded.accumulated_spent,
       order_count = order_count + 1`,
      [order.user_id, order.total_amount]);
  }
  return getRow(db, 'SELECT * FROM orders WHERE id=?', [orderId]);
}

// 确认支付（mock 模式由前端“模拟支付”按钮调用；真实网关由 webhook/回调调用）
export async function confirmPayment(db, paymentId, { txnId, raw } = {}) {
  const p = await getRow(db, 'SELECT * FROM payments WHERE id=?', [paymentId]);
  if (!p) throw new Error('支付单不存在');
  if (p.status === 'paid') return { ok: true, already: true };
  return {
    ok: true,
    order: await onPaid(db, p.order_id, p.id, p.method, txnId || ('mock_' + paymentId + '_' + Date.now())),
  };
}

// 退款（恢复库存、标记退款）
export async function refundPayment(db, orderId) {
  const order = await getRow(db, 'SELECT * FROM orders WHERE id=?', [orderId]);
  if (!order) throw new Error('订单不存在');
  if (order.status !== 'paid' && order.status !== 'shipped') throw new Error('仅已付款/已发货订单可退款');

  const pay = order.payment_id ? await getRow(db, 'SELECT * FROM payments WHERE id=?', [order.payment_id]) : null;
  if (pay && pay.status === 'paid') {
    await run(db, "UPDATE payments SET status='refunded', updated_at=datetime('now') WHERE id=?", [pay.id]);
  }
  const items = await allRows(db, 'SELECT product_id, quantity FROM order_items WHERE order_id=?', [orderId]);
  for (const it of items) {
    await run(db,
      "UPDATE inventory SET quantity = quantity + ?, updated_at=datetime('now') WHERE product_id=?",
      [it.quantity, it.product_id]);
  }
  await run(db, "UPDATE orders SET status='refunded', updated_at=datetime('now') WHERE id=?", [orderId]);
  return getRow(db, 'SELECT * FROM orders WHERE id=?', [orderId]);
}
