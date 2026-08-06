// src/routers/stats.js —— 销售数据统计（供后台仪表盘可视化）
import { Hono } from 'hono';
import { getDB, getRow, allRows } from '../db.js';
import { requireAdmin } from '../auth.js';

const r = new Hono();
r.use('*', requireAdmin);

r.get('/dashboard', async (c) => {
  const db = getDB(c);
  const totals = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM orders) total_orders,
      (SELECT COUNT(*) FROM orders WHERE status='paid' OR status='shipped' OR status='completed') paid_orders,
      (SELECT COUNT(*) FROM orders WHERE status='pending') pending_orders,
      (SELECT COUNT(*) FROM users) total_customers,
      (SELECT COUNT(*) FROM products WHERE status='on') on_sale_products,
      (SELECT COALESCE(SUM(total_amount),0) FROM orders WHERE status IN ('paid','shipped','completed')) revenue
    `).first();

  // 近 14 天销售额/订单数（折线图）
  const trend = await db.prepare(`SELECT date(created_at) d, COUNT(*) cnt,
      COALESCE(SUM(CASE WHEN status IN ('paid','shipped','completed') THEN total_amount ELSE 0 END),0) rev
      FROM orders WHERE created_at >= datetime('now','-13 days') GROUP BY date(created_at) ORDER BY d`).all();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const hit = trend.results.find((t) => t.d === d);
    days.push({ date: d.slice(5), revenue: hit ? hit.rev / 100 : 0, orders: hit ? hit.cnt : 0 });
  }

  // 分类销售占比（饼图）
  const byCat = await db.prepare(`SELECT c.name, COALESCE(SUM(oi.subtotal),0) rev, COUNT(DISTINCT o.id) orders
      FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id
      LEFT JOIN categories c ON c.id=p.category_id
      WHERE o.status IN ('paid','shipped','completed') GROUP BY c.id ORDER BY rev DESC`).all();
  const categorySales = byCat.results.map((rr) => ({ name: rr.name || '未分类', revenue: rr.rev / 100, orders: rr.orders }));

  // 近期订单
  const recentRows = await db.prepare(`SELECT o.id, o.order_no, o.status, o.total_amount, u.phone, u.name
      FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 10`).all();
  const recent = recentRows.results.map((o) => ({ ...o, total_amount: o.total_amount / 100 }));

  // 低库存预警
  const lowStock = await db.prepare(`SELECT p.id, p.name, i.quantity, i.warn_threshold FROM products p
      JOIN inventory i ON i.product_id=p.id WHERE i.quantity <= i.warn_threshold ORDER BY i.quantity ASC LIMIT 10`).all();

  return c.json({
    totals: { ...totals, revenue: totals.revenue / 100 },
    trend: days,
    categorySales,
    recent,
    lowStock: lowStock.results,
  });
});

export default r;
