/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/proxy/logo:
 *   get:
 *     summary: 代理直播频道 Logo
 *     description: 按直播源配置的 User-Agent 代理获取频道 Logo 图片。
 *     tags:
 *       - 代理
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 已编码的 Logo 图片地址
 *       - in: query
 *         name: moontv-source
 *         required: false
 *         schema:
 *           type: string
 *         description: 直播源标识，用于读取该直播源的 User-Agent
 *     responses:
 *       200:
 *         description: 返回图片数据流
 *         headers:
 *           Content-Type:
 *             description: 图片 MIME 类型
 *             schema:
 *               type: string
 *           Cache-Control:
 *             description: 缓存控制头
 *             schema:
 *               type: string
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: 缺少图片 URL
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       default:
 *         description: 图片获取失败或上游返回错误状态
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');
  const source = searchParams.get('moontv-source');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  const ua = liveSource?.ua || 'AptvPlayer/1.4.10';

  try {
    const decodedUrl = decodeURIComponent(imageUrl);
    const imageResponse = await fetch(decodedUrl, {
      cache: 'no-cache',
      redirect: 'follow',
      credentials: 'same-origin',
      headers: {
        'User-Agent': ua,
      },
    });

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: imageResponse.statusText },
        { status: imageResponse.status }
      );
    }

    const contentType = imageResponse.headers.get('content-type');

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 }
      );
    }

    // 创建响应头
    const headers = new Headers();
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    // 设置缓存头
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400'); // 缓存一天

    // 直接返回图片流
    return new Response(imageResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error fetching image' },
      { status: 500 }
    );
  }
}
