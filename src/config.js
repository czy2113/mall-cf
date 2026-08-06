// src/config.js —— Cloudflare Workers 版配置
// 注意：Workers 运行时没有 process.env，所有密钥/变量通过 wrangler.toml 的 [vars] 或 secret 注入，
// 在处理器中通过 c.env.XXX 读取。
export const DEFAULT_PAYMENT_METHOD = 'mock'; // mock / stripe / wechat / alipay
