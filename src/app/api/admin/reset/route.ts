/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { verifyAuth } from '@/lib/auth';
import { resetConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/admin/reset:
 *   get:
 *     summary: 重置管理员配置
 *     description: 站长接口，将管理员配置重置为默认配置。
 *     tags:
 *       - 管理
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 重置成功
 *         headers:
 *           Cache-Control:
 *             description: 缓存控制头
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: 当前存储类型不支持管理员配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录或非站长用户
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 重置管理员配置失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */
export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  const authInfo = await verifyAuth(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const username = authInfo.username;

  if (username !== process.env.USERNAME) {
    return NextResponse.json({ error: '仅支持站长重置配置' }, { status: 401 });
  }

  try {
    await resetConfig();

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store', // 管理员配置不缓存
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: '重置管理员配置失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
