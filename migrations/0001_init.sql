-- D1 初始化：建表 + 索引（通过 `wrangler d1 execute mall_db --file=migrations/0001_init.sql` 执行一次）
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

-- 商家视角的客户档案（在 users 基础上补充运营字段）
CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id          INTEGER PRIMARY KEY,
  level            TEXT NOT NULL DEFAULT 'normal',   -- normal / vip / svip
  note             TEXT,
  tags             TEXT,                              -- 逗号分隔
  accumulated_spent INTEGER NOT NULL DEFAULT 0,       -- 累计消费(分)
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
  price       INTEGER NOT NULL DEFAULT 0,            -- 单位：分
  image_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'on',            -- on / off
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 库存（独立表，便于后续扩展多仓库）
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
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending/paid/shipped/completed/cancelled/refunded
  total_amount    INTEGER NOT NULL DEFAULT 0,        -- 分
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
  price       INTEGER NOT NULL DEFAULT 0,            -- 下单时单价(分)
  quantity    INTEGER NOT NULL DEFAULT 1,
  subtotal    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id       INTEGER NOT NULL,
  method         TEXT NOT NULL DEFAULT 'mock',       -- mock/stripe/wechat/alipay
  amount         INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'created',    -- created/paid/failed/refunded
  gateway_txn_id TEXT,
  raw            TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 服务端购物车（跨设备实时同步）
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
