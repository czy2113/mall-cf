// src/auth.js —— JWT 鉴权（顾客 user / 商家 admin 双角色）
// 使用 hono/jwt（基于 Web Crypto，兼容 Cloudflare Workers；jsonwebtoken 在 Workers 不可用）。
import { sign, verify } from 'hono/jwt';

export async function signUser(c, user) {
  return sign({ sub: user.id, role: 'user', phone: user.phone }, c.env.JWT_SECRET, 'HS256');
}
export async function signAdmin(c, admin) {
  return sign({ sub: admin.id, role: 'admin', username: admin.username }, c.env.JWT_SECRET, 'HS256');
}

// 解析并校验 token，返回 payload 或 null
export async function verifyToken(c, token) {
  try {
    return await verify(token, c.env.JWT_SECRET, 'HS256');
  } catch {
    return null;
  }
}

// Hono 中间件工厂：要求指定角色
export function authGuard(role) {
  return async (c, next) => {
    const h = c.req.header('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const payload = await verifyToken(c, token);
    if (!payload) return c.json({ error: '未登录或登录已过期' }, 401);
    if (role && payload.role !== role) return c.json({ error: '无权限' }, 403);
    c.set('user', payload);
    await next();
  };
}
export const requireUser = authGuard('user');
export const requireAdmin = authGuard('admin');
