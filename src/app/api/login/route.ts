/* eslint-disable no-console */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { signAccessToken, signRefreshToken } from '@/lib/jwt';
import {
  revokeUserRefreshTokens,
  storeRefreshToken,
} from '@/lib/refresh-token';

export const runtime = 'nodejs';

// 读取存储类型环境变量，默认 localstorage
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'localstorage';

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: 用户登录
 *     description: 用户登录接口，支持本地存储模式和数据库模式
 *     tags:
 *       - 认证
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 description: 密码（本地存储模式）
 *               username:
 *                 type: string
 *                 description: 用户名（数据库模式）
 *             oneOf:
 *               - required: [password]
 *               - required: [username, password]
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 accessToken:
 *                   type: string
 *                   description: Access Token (短期有效，1小时)
 *                 refreshToken:
 *                   type: string
 *                   description: Refresh Token (长期有效，30天)
 *                 expires_in:
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
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 用户名或密码错误
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 error:
 *                   type: string
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function POST(req: NextRequest) {
  try {
    // 本地 / localStorage 模式——仅校验固定密码
    if (STORAGE_TYPE === 'localstorage') {
      const envPassword = process.env.PASSWORD;

      // 未配置 PASSWORD 时直接放行
      if (!envPassword) {
        return NextResponse.json({ ok: true });
      }

      const { password } = await req.json();
      if (typeof password !== 'string') {
        return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
      }

      if (password !== envPassword) {
        return NextResponse.json(
          { ok: false, error: '密码错误' },
          { status: 401 }
        );
      }

      // 验证成功，生成 Access Token 和 Refresh Token
      const payload = {
        role: 'user' as const,
        type: 'local' as const,
      };

      // 先撤销该用户之前的 refresh token（如果有）
      revokeUserRefreshTokens();

      const accessToken = await signAccessToken(payload, '1h');
      const refreshToken = await signRefreshToken(payload, '30d');

      // 存储 refresh token
      storeRefreshToken(refreshToken, payload, 30 * 24 * 60 * 60); // 30天

      // 计算 access token 过期时间戳（1小时后）
      const expiresIn = Math.floor(Date.now() / 1000) + 60 * 60; // 当前时间戳 + 1小时（秒）

      return NextResponse.json({
        ok: true,
        accessToken,
        refreshToken,
        expires_in: expiresIn,
        role: 'user',
        username: undefined,
      });
    }

    // 数据库 / redis 模式——校验用户名并尝试连接数据库
    const { username, password } = await req.json();

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: '用户名不能为空' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    // 可能是站长，直接读环境变量
    if (
      username === process.env.USERNAME &&
      password === process.env.PASSWORD
    ) {
      // 验证成功，生成 Access Token 和 Refresh Token
      const payload = {
        username,
        role: 'owner' as const,
        type: 'db' as const,
      };

      // 先撤销该用户之前的 refresh token
      revokeUserRefreshTokens(username);

      const accessToken = await signAccessToken(payload, '1h');
      const refreshToken = await signRefreshToken(payload, '30d');

      // 存储 refresh token
      storeRefreshToken(refreshToken, payload, 30 * 24 * 60 * 60); // 30天

      // 计算 access token 过期时间戳（1小时后）
      const expiresIn = Math.floor(Date.now() / 1000) + 60 * 60; // 当前时间戳 + 1小时（秒）

      return NextResponse.json({
        ok: true,
        accessToken,
        refreshToken,
        expires_in: expiresIn,
        role: 'owner',
        username,
      });
    } else if (username === process.env.USERNAME) {
      return NextResponse.json({ error: '用户名或密码错误' }, { status: 401 });
    }

    const config = await getConfig();
    const user = config.UserConfig.Users.find((u) => u.username === username);
    if (user && user.banned) {
      return NextResponse.json({ error: '用户被封禁' }, { status: 401 });
    }

    // 校验用户密码
    try {
      const pass = await db.verifyUser(username, password);
      if (!pass) {
        return NextResponse.json(
          { error: '用户名或密码错误' },
          { status: 401 }
        );
      }

      // 验证成功，生成 Access Token 和 Refresh Token
      const payload = {
        username,
        role: (user?.role || 'user') as 'owner' | 'admin' | 'user',
        type: 'db' as const,
      };

      // 先撤销该用户之前的 refresh token
      revokeUserRefreshTokens(username);

      const accessToken = await signAccessToken(payload, '1h');
      const refreshToken = await signRefreshToken(payload, '30d');

      // 存储 refresh token
      storeRefreshToken(refreshToken, payload, 30 * 24 * 60 * 60); // 30天

      // 计算 access token 过期时间戳（1小时后）
      const expiresIn = Math.floor(Date.now() / 1000) + 60 * 60; // 当前时间戳 + 1小时（秒）

      return NextResponse.json({
        ok: true,
        accessToken,
        refreshToken,
        expires_in: expiresIn,
        role: user?.role || 'user',
        username,
      });
    } catch (err) {
      console.error('数据库验证失败', err);
      return NextResponse.json({ error: '数据库错误' }, { status: 500 });
    }
  } catch (error) {
    console.error('登录接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
