import { NextRequest, NextResponse } from 'next/server';

import { revokeRefreshToken } from '@/lib/refresh-token';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/logout:
 *   post:
 *     summary: 用户登出
 *     description: 用户登出接口，清除服务端的 refresh token
 *     tags:
 *       - 认证
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh Token（可选）
 *     responses:
 *       200:
 *         description: 登出成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 */
export async function POST(req: NextRequest) {
  try {
    // 尝试从请求体获取 refresh token
    const body = await req.json().catch(() => ({}));
    if (body.refreshToken && typeof body.refreshToken === 'string') {
      revokeRefreshToken(body.refreshToken);
    }
  } catch {
    // 忽略错误，即使没有提供 refresh token 也允许登出
  }

  const response = NextResponse.json({ ok: true });
  // Cookie 鉴权已移除，不再需要删除 cookie
  return response;
}
