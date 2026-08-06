// src/db.js —— D1 帮助函数
// 运行时不再建表（Cloudflare D1 的表由 migrations/0001_init.sql 通过 `wrangler d1 execute` 创建一次）。
// 所有查询都是异步的：传入 D1Database 实例（c.env.DB）。

export function getDB(c) {
  return c.env.DB;
}

export async function getRow(db, sql, params = []) {
  return db.prepare(sql).bind(...params).first();
}

export async function allRows(db, sql, params = []) {
  const r = await db.prepare(sql).bind(...params).all();
  return r.results || [];
}

export async function run(db, sql, params = []) {
  return db.prepare(sql).bind(...params).run();
}

export async function insertId(db, sql, params = []) {
  const r = await db.prepare(sql).bind(...params).run();
  return Number(r.meta.last_row_id);
}

export async function setSetting(db, key, value) {
  await db.prepare(
    'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).bind(key, value == null ? '' : String(value)).run();
}

export async function allSettings(db) {
  const rows = await allRows(db, 'SELECT key, value FROM settings');
  const o = {};
  for (const r of rows) o[r.key] = r.value;
  return o;
}

export async function getSetting(db, key) {
  const r = await getRow(db, 'SELECT value FROM settings WHERE key=?', [key]);
  return r ? r.value : null;
}

// 订单号：M + 年月日时分 + 4位随机
export function genOrderNo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `M${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${rand}`;
}
