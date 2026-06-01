/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { verifyAuth } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/admin/config_subscription/fetch:
 *   post:
 *     summary: 拉取配置订阅
 *     description: 站长接口，从远程订阅地址获取 Base58 编码的配置内容并解码返回。
 *     tags:
 *       - 管理
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 description: 配置订阅地址
 *     responses:
 *       200:
 *         description: 配置拉取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 configContent:
 *                   type: string
 *                   description: 解码后的配置内容
 *                 message:
 *                   type: string
 *       400:
 *         description: 缺少 URL 参数
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
 *       default:
 *         description: 上游请求失败或配置解码失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function POST(request: NextRequest) {
  try {
    // 权限检查：仅站长可以拉取配置订阅
    const authInfo = await verifyAuth(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (authInfo.username !== process.env.USERNAME) {
      return NextResponse.json(
        { error: '权限不足，只有站长可以拉取配置订阅' },
        { status: 401 }
      );
    }

    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: '缺少URL参数' }, { status: 400 });
    }

    // 直接 fetch URL 获取配置内容
    const response = await fetch(url);

    if (!response.ok) {
      return NextResponse.json(
        { error: `请求失败: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const configContent = await response.text();

    // 对 configContent 进行 base58 解码
    let decodedContent;
    try {
      const bs58 = (await import('bs58')).default;
      const decodedBytes = bs58.decode(configContent);
      decodedContent = new TextDecoder().decode(decodedBytes);
    } catch (decodeError) {
      console.warn('Base58 解码失败', decodeError);
      throw decodeError;
    }

    return NextResponse.json({
      success: true,
      configContent: decodedContent,
      message: '配置拉取成功',
    });
  } catch (error) {
    console.error('拉取配置失败:', error);
    return NextResponse.json({ error: '拉取配置失败' }, { status: 500 });
  }
}
