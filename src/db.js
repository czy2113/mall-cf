// src/db.js —— 数据库层（libSQL / Turso 兼容）
//
// 为了把后端从 Cloudflare D1 平滑迁移到 Vercel + Turso（云端 SQLite），
// 这里用一个「D1 兼容垫片」把 @libsql/client 包装成与 D1 完全一致的接口：
//   db.prepare(sql).bind(...args).first() / .all() / .run()
//   db.exec(multiStatementSql)
// 这样所有 router 与业务模块（products/orders/payments...）的代码可以一行不改。
//
// 连接来源（优先级）：
//   1. 环境变量 TURSO_URL + TURSO_AUTH_TOKEN（Turso 云端数据库，生产用）
//   2. 缺省回退到本地文件 file:./mall_local.db（本地开发/测试用，无需任何 token）

import { createClient } from '@libsql/client';

let _client = null;

export function getClient() {
  if (!_client) {
    const url = process.env.TURSO_URL || 'file:./mall_local.db';
    const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
    _client = createClient({ url, authToken });
  }
  return _client;
}

// 把单条 SQL 包装成「D1 风格」的语句对象
function createStatement(client, sql) {
  let args = [];
  const stmt = {
    bind(...a) {
      args = a;
      return stmt;
    },
    async first() {
      const res = await client.execute({ sql, args });
      return res.rows.length ? res.rows[0] : null;
    },
    async all() {
      const res = await client.execute({ sql, args });
      // D1 的 .all() 返回 { results: [...] }，router 里普遍用 rows.results
      return { results: res.rows, columns: res.columns };
    },
    async run() {
      const res = await client.execute({ sql, args });
      // D1 的 .run() 返回 { meta: { last_row_id, changes } }
      return {
        meta: {
          last_row_id: Number(res.lastInsertRowid),
          changes: res.rowsAffected,
        },
      };
    },
  };
  return stmt;
}

// 兼容 D1 的「数据库对象」。不再从 c.env.DB 取，而是全局单例 client 的封装。
export function getDB(c) {
  const client = getClient();
  return {
    prepare: (sql) => createStatement(client, sql),
    // schema.js 用 db.exec() 执行多语句建表/种子
    async exec(sql) {
      await client.executeMultiple(sql);
    },
  };
}

// ===== 以下辅助函数保持原签名，内部走上述兼容接口 =====

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
