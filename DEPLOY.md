# 商城部署指南（Vercel + Turso 版）

端到端架构：**Hono（与平台无关的核心应用）+ Vercel Serverless Functions + Turso 云端 SQLite**。
- 固定网址：`https://<项目名>.vercel.app`（免费、无需信用卡、无需自有域名）
- 顾客端静态页由 Vercel 从 `public/` 自动托管（`/`、`/admin`、CSS/JS 均无需代码兜底）
- API 由 `api/[[...]].js`（Hono `app.fetch`）处理，数据库用 Turso（libSQL）

## 环境变量（Vercel 项目 Settings → Environment Variables）
| 变量 | 说明 |
|------|------|
| `TURSO_URL` | Turso 数据库 URL，形如 `https://xxxx.turso.io` |
| `TURSO_AUTH_TOKEN` | Turso 数据库访问令牌 |
| `JWT_SECRET` | 任意随机字符串（用于 JWT 签名） |

## 数据库（Turso，一次性）
1. 注册 https://turso.tech （免费）
2. 安装 CLI 或网页创建数据库：`turso db create mall`
3. 取数据库 URL：`turso db show mall --url`
4. 创建访问令牌：`turso db tokens create mall`
5. 把 URL 与令牌填入上面的环境变量

## 部署
- 助手持有 Vercel token 时执行 `vercel deploy --prod`（读取 `vercel.json`，入口 `api/[[...]].js`）。
- 或用户在 Vercel 控制台「Add New → Project → Import Git Repository」选 `mall-cf`，设置上述三个环境变量后点 Deploy。

## 验证
- 顾客端：`/`
- 商家端：`/admin`（账号 `admin` / 密码 `123456`）
- API 健康检查：`/api/health`
- 商品列表：`/api/products`
- 首次访问会自动建表并灌入 6 个商品 + 默认设置（由 `src/schema.js` 幂等执行）。

## 代码说明
- `src/db.js`：用 `@libsql/client` 包装成与 Cloudflare D1 完全一致的接口（prepare/bind/first/all/run/exec），因此所有 router 业务代码零改动即可从 D1 迁移到 Turso。
- `src/app.js`：与平台无关的核心 Hono 应用（仅 `/api/*` 路由 + 自动建表中间件）。
- `api/[[...]].js`：Vercel 入口，直接 `app.fetch(request)`。
