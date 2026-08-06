// src/routers/products.js
import { Hono } from 'hono';
import { getDB, getRow, allRows } from '../db.js';
import { requireAdmin } from '../auth.js';

const r = new Hono();

// 把商品行拼上库存
async function withStock(db, rows) {
  const out = [];
  for (const p of rows) {
    const inv = await getRow(db, 'SELECT quantity, warn_threshold FROM inventory WHERE product_id=?', [p.id]);
    out.push({ ...p, price: p.price / 100, stock: inv ? inv.quantity : 0, warn_threshold: inv ? inv.warn_threshold : 0 });
  }
  return out;
}

// 公开：商品列表（顾客端 + 后台共用），支持分类/关键词/上下架过滤
r.get('/', async (c) => {
  const db = getDB(c);
  const category_id = c.req.query('category_id');
  const keyword = c.req.query('keyword');
  const status = c.req.query('status');
  const page = Number(c.req.query('page') || 1);
  const pageSize = Number(c.req.query('pageSize') || 20);
  const where = [];
  const params = [];
  if (category_id) { where.push('p.category_id=?'); params.push(category_id); }
  if (status && status !== 'all') { where.push('p.status=?'); params.push(status); }
  else if (!status) { where.push("p.status='on'"); } // 顾客端默认只看上架；status=all 则返回全部
  if (keyword) { where.push('(p.name LIKE ? OR p.description LIKE ?)'); params.push('%' + keyword + '%', '%' + keyword + '%'); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const totalRow = await db.prepare(`SELECT COUNT(*) c FROM products p ${w}`).bind(...params).first();
  const rows = await db.prepare(
    `SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id
     ${w} ORDER BY p.id DESC LIMIT ? OFFSET ?`
  ).bind(...params, pageSize, (page - 1) * pageSize).all();
  return c.json({ total: totalRow.c, page, pageSize, items: await withStock(db, rows.results) });
});

// 公开：商品详情
r.get('/:id', async (c) => {
  const db = getDB(c);
  const p = await db.prepare(
    'SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=?'
  ).bind(c.req.param('id')).first();
  if (!p) return c.json({ error: '商品不存在' }, 404);
  const inv = await getRow(db, 'SELECT quantity FROM inventory WHERE product_id=?', [p.id]);
  return c.json({ ...p, price: p.price / 100, stock: inv ? inv.quantity : 0 });
});

// 分类列表
r.get('/categories/list', async (c) => {
  const db = getDB(c);
  const cats = await db.prepare('SELECT * FROM categories ORDER BY sort, id').all();
  return c.json({ items: cats.results });
});

// ===== 以下为商家管理（需鉴权） =====
r.post('/', requireAdmin, async (c) => {
  const db = getDB(c);
  const { category_id, name, description, price, image_url, status, stock, warn_threshold } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ error: '商品名称必填' }, 400);
  const info = await db.prepare(
    'INSERT INTO products (category_id, name, description, price, image_url, status) VALUES (?,?,?,?,?,?)'
  ).bind(category_id || null, name, description || '', Math.round(Number(price) * 100), image_url || '', status || 'on').run();
  const pid = Number(info.meta.last_row_id);
  await db.prepare('INSERT INTO inventory (product_id, quantity, warn_threshold) VALUES (?,?,?)')
    .bind(pid, Number(stock) || 0, Number(warn_threshold) || 10).run();
  return c.json({ id: pid });
});

r.put('/:id', requireAdmin, async (c) => {
  const db = getDB(c);
  const id = c.req.param('id');
  const p = await getRow(db, 'SELECT * FROM products WHERE id=?', [id]);
  if (!p) return c.json({ error: '商品不存在' }, 404);
  const b = await c.req.json().catch(() => ({}));
  await db.prepare(`UPDATE products SET
      category_id = COALESCE(?, category_id),
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      price = COALESCE(?, price),
      image_url = COALESCE(?, image_url),
      status = COALESCE(?, status),
      updated_at = datetime('now')
      WHERE id = ?`).bind(
    b.category_id !== undefined ? (b.category_id || null) : null,
    b.name ?? null,
    b.description ?? null,
    b.price !== undefined ? Math.round(Number(b.price) * 100) : null,
    b.image_url ?? null,
    b.status ?? null,
    id
  ).run();
  if (b.stock !== undefined) {
    await db.prepare("UPDATE inventory SET quantity=?, updated_at=datetime('now') WHERE product_id=?")
      .bind(Number(b.stock), id).run();
  }
  return c.json({ ok: true });
});

r.delete('/:id', requireAdmin, async (c) => {
  const db = getDB(c);
  await db.prepare('DELETE FROM products WHERE id=?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// 分类管理
r.post('/categories', requireAdmin, async (c) => {
  const db = getDB(c);
  const { name, sort } = await c.req.json().catch(() => ({}));
  if (!name) return c.json({ error: '名称必填' }, 400);
  const info = await db.prepare('INSERT INTO categories (name, sort) VALUES (?,?)').bind(name, sort || 0).run();
  return c.json({ id: Number(info.meta.last_row_id) });
});
r.delete('/categories/:id', requireAdmin, async (c) => {
  const db = getDB(c);
  await db.prepare('DELETE FROM categories WHERE id=?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

export default r;
