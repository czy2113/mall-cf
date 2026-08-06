// src/schema.js —— 首次请求时自动建表 + 灌种子数据（Cloudflare D1）
// 这样部署后无需手动执行 migration/seed.sql，应用自己把库初始化好。
// 所有语句都是幂等的（CREATE TABLE IF NOT EXISTS / 仅在 products 为空时灌种）。

const DDL_SQL = `
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  avatar        TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id          INTEGER PRIMARY KEY,
  level            TEXT NOT NULL DEFAULT 'normal',
  note             TEXT,
  tags             TEXT,
  accumulated_spent INTEGER NOT NULL DEFAULT 0,
  order_count      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER,
  name        TEXT NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL DEFAULT 0,
  image_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'on',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  product_id      INTEGER PRIMARY KEY,
  quantity        INTEGER NOT NULL DEFAULT 0,
  warn_threshold  INTEGER NOT NULL DEFAULT 10,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no        TEXT UNIQUE NOT NULL,
  user_id         INTEGER,
  status          TEXT NOT NULL DEFAULT 'pending',
  total_amount    INTEGER NOT NULL DEFAULT 0,
  address         TEXT,
  receiver_name   TEXT,
  receiver_phone  TEXT,
  remark          TEXT,
  payment_id      INTEGER,
  payment_method  TEXT,
  paid_at         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL,
  product_id  INTEGER,
  name        TEXT,
  price       INTEGER NOT NULL DEFAULT 0,
  quantity    INTEGER NOT NULL DEFAULT 1,
  subtotal    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL,
  method         TEXT NOT NULL DEFAULT 'mock',
  amount         INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'created',
  gateway_txn_id TEXT,
  raw            TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id    INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
`;

const SEED_SQL = `
INSERT INTO categories (id, name, sort) VALUES (1, '热销推荐', 0);
INSERT INTO categories (id, name, sort) VALUES (2, '数码电子', 1);
INSERT INTO categories (id, name, sort) VALUES (3, '服饰鞋包', 2);
INSERT INTO categories (id, name, sort) VALUES (4, '生鲜食品', 3);
INSERT INTO categories (id, name, sort) VALUES (5, '家居日用', 4);

INSERT INTO admins (id, username, password_hash, name) VALUES (1, 'admin', '$2a$10$rtFMkoY96nBTk.pG4f8h/.xWPHbCZjjE4sWck5DcdwyA1R91WGF3u', '超级管理员');

INSERT INTO products (id, category_id, name, description, price, image_url, status) VALUES (1, 1, '精选礼盒', '精选礼盒，品质优选，欢迎选购。', 9900, 'https://picsum.photos/seed/box/400', 'on');
INSERT INTO products (id, category_id, name, description, price, image_url, status) VALUES (2, 2, '无线蓝牙耳机', '无线蓝牙耳机，品质优选，欢迎选购。', 19900, 'https://picsum.photos/seed/earbuds/400', 'on');
INSERT INTO products (id, category_id, name, description, price, image_url, status) VALUES (3, 2, '智能手表', '智能手表，品质优选，欢迎选购。', 39900, 'https://picsum.photos/seed/watch/400', 'on');
INSERT INTO products (id, category_id, name, description, price, image_url, status) VALUES (4, 3, '纯棉T恤', '纯棉T恤，品质优选，欢迎选购。', 5900, 'https://picsum.photos/seed/tshirt/400', 'on');
INSERT INTO products (id, category_id, name, description, price, image_url, status) VALUES (5, 4, '新鲜水果礼包', '新鲜水果礼包，品质优选，欢迎选购。', 12900, 'https://picsum.photos/seed/fruit/400', 'on');
INSERT INTO products (id, category_id, name, description, price, image_url, status) VALUES (6, 5, '北欧风台灯', '北欧风台灯，品质优选，欢迎选购。', 15900, 'https://picsum.photos/seed/lamp/400', 'on');

INSERT INTO inventory (product_id, quantity, warn_threshold) VALUES (1, 50, 10);
INSERT INTO inventory (product_id, quantity, warn_threshold) VALUES (2, 30, 10);
INSERT INTO inventory (product_id, quantity, warn_threshold) VALUES (3, 20, 10);
INSERT INTO inventory (product_id, quantity, warn_threshold) VALUES (4, 100, 10);
INSERT INTO inventory (product_id, quantity, warn_threshold) VALUES (5, 40, 10);
INSERT INTO inventory (product_id, quantity, warn_threshold) VALUES (6, 25, 10);

INSERT INTO settings (key, value) VALUES ('shop_name', '我的多店铺商城');
INSERT INTO settings (key, value) VALUES ('shop_logo', '');
INSERT INTO settings (key, value) VALUES ('contact_phone', '');
INSERT INTO settings (key, value) VALUES ('announcement', '欢迎光临本商城，满99元包邮！');
INSERT INTO settings (key, value) VALUES ('payment_method', 'mock');
`;

let _ready = null;

export async function ensureSchema(db) {
  if (!db) {
    throw new Error('DB_NOT_BOUND');
  }
  if (_ready) return _ready;
  _ready = (async () => {
    await db.exec(DDL_SQL);
    const row = await db.prepare('SELECT COUNT(*) AS c FROM products').first();
    if (!row || row.c === 0) {
      await db.exec(SEED_SQL);
    }
  })();
  try {
    await _ready;
  } catch (e) {
    _ready = null; // 失败则下次重试
    throw e;
  }
  return _ready;
}
