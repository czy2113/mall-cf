# 商城系统 · Cloudflare 免费托管版（Workers + D1）

`mall-cf/` 是「顾客端 + 商家端 共享同一后端」的全栈应用，后端运行在 **Cloudflare Workers**（免费额度：每天 10 万次请求、D1 免费 5GB 数据库），数据存 **Cloudflare D1**（托管版 SQLite，自动持久、重启不变）。**完全免费、无需信用卡、无需购买域名。**

> 与原 `mall/`（Node + node:sqlite 本地版）的区别：数据库由 D1 托管，框架由 Express 改为 Hono，鉴权用 `hono/jwt`（Workers 兼容）。前端 `public/` 一致。

## 你（用户）要做的 4 步
本方案由助手把代码推到你的 GitHub，你只需在浏览器里点几下。代码已内置**首次访问自动建表 + 灌种子数据**，所以你连 SQL 都不用粘贴。

### 1) 注册 Cloudflare（免费）
打开 https://dash.cloudflare.com/sign-up 注册（用邮箱即可，不用信用卡）。

### 2) 建一个 D1 数据库，并把「数据库 ID」发给助手
- Cloudflare 控制台 → 左侧 **Workers 和 Pages** → **D1** → **创建数据库**
- 名称填 `mall_db`，创建。
- 创建后页面会显示一串 **Database ID**（点复制）。把它发给我（助手会写进 `wrangler.toml`）。

### 3) 建 GitHub 仓库 + 个人访问令牌（PAT）
- 打开 https://github.com/signup 注册（免费）。
- 新建一个**空仓库**，名称 `mall-cf`（不要勾选添加 README）。
- 生成令牌：GitHub 右上角头像 → **Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic)**
  - 勾选 `repo`（整项）即可，过期选 7 天或 30 天。
  - 生成后**复制那串 token**（只显示一次）。
- 把下面两样发给我：
  1. 你的仓库地址，形如 `https://github.com/<你的用户名>/mall-cf.git`
  2. 第 3 步生成的 PAT

### 4) 在 Cloudflare 后台连接 Git 并部署（得到固定网址）
代码已推到你的 GitHub（见上）。现在你在浏览器里完成最后一步：
- Cloudflare 控制台 → **Workers 和 Pages** → **创建**（Create）→ 选 **Workers** 标签 → 点 **通过 Git 连接 / Deploy from Git**
- 授权 GitHub（首次会跳 GitHub 登录授权，允许 Cloudflare 访问你的仓库）→ 选择仓库 `mall-cf`
- 配置保持默认即可；若看到「构建命令 / Build command」填空，填 `npm install`（Cloudflare 会自动按 `wrangler.toml` 部署）
- 点 **部署 / Deploy**。首次部署会让你设一个 `*.workers.dev` 子域名（任取，如 `my-mall`），**之后固定不变**。
- 部署完成后，访问 `https://mall-shop.<你的子域>.workers.dev`：
  - 顾客端：`/`
  - 商家端：`/admin`（账号 `admin` / 密码 `123456`）
- 第一次打开时后端会自动建表并灌入 6 个商品 + 默认设置，稍等 1~2 秒即可。

> **D1 绑定兜底**：`wrangler.toml` 已声明 `[[d1_databases]] binding="DB" database_name="mall_db"`，正常会自动绑定。
> 若打开网站提示「数据库尚未绑定 / 数据库初始化失败」，请到 Worker → **设置 / Settings → 变量和绑定 / Bindings** → **添加 / Add** → 选 **D1 数据库**，变量名填 `DB`、数据库选 `mall_db`，保存后**重新部署**。

> **排错**：若部署日志报错，把红字贴给助手，我帮你改。最常见的是构建命令或 D1 绑定两项。

## 目录结构
```
mall-cf/
├─ src/
│  ├─ worker.js          # Workers 入口（Hono 应用，挂载所有 /api 路由）
│  ├─ schema.js          # 首次请求自动建表 + 灌种子（幂等）
│  ├─ config.js          # 配置（支付模式）
│  ├─ db.js              # D1 帮助函数（异步）
│  ├─ auth.js            # JWT 双角色鉴权（hono/jwt）
│  ├─ payments.js        # 支付副作用（扣库存/退款恢复）
│  └─ routers/           # 9 个路由模块
├─ public/               # 顾客端 + 商家端前端
├─ migrations/0001_init.sql  # 建表 SQL（已内置自动执行，无需手动跑）
├─ seed.sql              # 种子数据（已内置自动执行）
├─ wrangler.toml        # 部署配置（D1 绑定 + 静态资源）
└─ package.json
```

## 备用：如果你自己在本地用 wrangler 部署
```bash
cd mall-cf
npm install
npx wrangler login
npx wrangler d1 create mall_db     # 把返回的 id 填进 wrangler.toml 的 database_id
npx wrangler deploy
```
（表结构与种子会在首次访问时自动初始化，无需手动执行 migration/seed。）

## 生产加固建议
1. `npx wrangler secret put JWT_SECRET` 设置强密钥（替代 wrangler.toml 明文）。
2. 绑定自定义域名：Cloudflare 控制台 → Worker → 触发器 → 自定义域（免费）。
3. 真实支付：在 `src/payments.js` / `src/routers/payments.js` 落地签名校验。
