// api/[[...]].js —— Vercel Serverless 函数入口（Hono on Vercel）
// Hono 是 Web 标准框架，直接把标准 Request 交给 app.fetch 处理即可，
// 无需额外适配器。对应 /api/* 的所有请求在此处理；
// 而 / 、/admin 、静态文件由 Vercel 自动从 public/ 目录托管，无需代码兜底。
import app from '../src/app.js';

// 指定 Node.js 运行时（libSQL 客户端依赖 Node 原生模块，不能用 Edge）
export const config = { runtime: 'nodejs' };

export default async function handler(request) {
  return await app.fetch(request);
}
