/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import {
  ACCESS_TOKEN_EXPIRES_IN,
  ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  REFRESH_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN_SECONDS,
} from '@/lib/auth-constants';
import { signAccessToken, signRefreshToken, verifyJWT } from '@/lib/jwt';
import {
  revokeRefreshToken,
  storeRefreshToken,
  verifyRefreshToken,
} from '@/lib/refresh-token';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/refresh:
 *   post:
 *     summary: 刷新Access Token (OAuth 2.0风格)
 *     description: 使用Refresh Token刷新获取新的Access Token
 *     tags:
 *       - 认证
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: Refresh Token
 *     responses:
 *       200:
 *         description: 刷新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 accessToken:
 *                   type: string
 *                   description: 新的Access Token
 *                 refreshToken:
 *                   type: string
 *                   description: 新的Refresh Token（可选，如果原token仍有效则返回原token）
 *                 expiresIn:
 *                   type: integer
 *                   description: Access Token 过期时间戳（Unix 时间戳，单位：秒）
 *                 role:
 *                   type: string
 *                   enum: [user, owner, admin]
 *                 username:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: 请求参数错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       401:
 *         description: Refresh Token无效或已过期
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 error:
 *                   type: string
 */
export async function POST(req: NextRequest) {
  try {
    const clientPlatform = req.headers.get('X-Client-Platform') || 'web';
    const body = await req.json().catch(() => ({}));
    const { refreshToken } = body;

    if (!refreshToken || typeof refreshToken !== 'string') {
      return NextResponse.json(
        { ok: false, error: '未提供refreshToken' },
        { status: 400 },
      );
    }

    // 验证 refresh token（从存储中验证）
    const tokenRecord = await verifyRefreshToken(clientPlatform, refreshToken);
    if (!tokenRecord) {
      console.log('[API/refresh] Refresh Token verify failed: not found in storage or expired');
      return NextResponse.json(
        { ok: false, error: 'Refresh Token无效或已过期' },
        { status: 401 },
      );
    }

    // 可选：验证 refresh token 的签名（双重验证）
    const verifiedPayload = await verifyJWT(refreshToken);
    if (!verifiedPayload) {
      console.log('[API/refresh] Refresh Token verify failed: invalid signature');
      // 如果签名验证失败，删除存储中的记录
      await revokeRefreshToken(clientPlatform, refreshToken);
      return NextResponse.json(
        { ok: false, error: 'Refresh Token签名验证失败' },
        { status: 401 },
      );
    }

    const payload = {
      username: tokenRecord.username,
      role: tokenRecord.role,
      type: tokenRecord.type,
    };

    // 生成新的 access token
    const newAccessToken = await signAccessToken(payload, ACCESS_TOKEN_EXPIRES_IN);

    // 计算 access token 过期时间戳（1小时后）
    const expiresIn = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRES_IN_SECONDS;

    // 生成新的 refresh token
    const newRefreshToken = await signRefreshToken(payload, REFRESH_TOKEN_EXPIRES_IN);

    // 撤销旧的 refresh token
    await revokeRefreshToken(clientPlatform, refreshToken);

    // 存储新的 refresh token
    await storeRefreshToken(
      clientPlatform,
      newRefreshToken,
      payload,
      REFRESH_TOKEN_EXPIRES_IN_SECONDS,
    );

    return NextResponse.json({
      ok: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: expiresIn,
      role: tokenRecord.role,
      username: tokenRecord.username,
    });
  } catch (error) {
    console.error('刷新token接口异常', error);
    return NextResponse.json(
      { ok: false, error: '服务器错误' },
      { status: 500 },
    );
  }
}
