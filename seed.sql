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
