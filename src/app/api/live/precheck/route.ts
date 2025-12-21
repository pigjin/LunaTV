/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/live/precheck:
 *   get:
 *     summary: 预检查直播流
 *     description: 检查直播流URL是否可访问，并返回流类型
 *     tags:
 *       - 直播
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 直播流URL
 *       - in: query
 *         name: moontv-source
 *         required: true
 *         schema:
 *           type: string
 *         description: 直播源标识
 *     responses:
 *       200:
 *         description: 检查成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 type:
 *                   type: string
 *                   enum: [mp4, flv, m3u8]
 *                   description: 流类型
 *       400:
 *         description: 缺少URL或URL格式无效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 直播源未找到
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 检查失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 message:
 *                   type: string
 *       504:
 *         description: 请求超时
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 message:
 *                   type: string
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const source = searchParams.get('moontv-source');

  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }
  const config = await getConfig();
  const liveSource = config.LiveConfig?.find((s: any) => s.key === source);
  if (!liveSource) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }
  const ua = liveSource.ua || 'AptvPlayer/1.4.10';

  try {
    let decodedUrl = url;
    if (!/^https?:\/\//i.test(decodedUrl)) {
      try {
        decodedUrl = decodeURIComponent(url);
      } catch {
        decodedUrl = url;
      }
    }

    if (!/^https?:\/\//i.test(decodedUrl)) {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 });
    }

    const response = await fetch(decodedUrl, {
      cache: 'no-cache',
      redirect: 'follow',
      headers: {
        'User-Agent': ua,
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Failed to fetch',
          status: response.status,
          statusText: response.statusText,
        },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('Content-Type');
    if (response.body) {
      response.body.cancel();
    }
    if (contentType?.includes('video/mp4')) {
      return NextResponse.json({ success: true, type: 'mp4' }, { status: 200 });
    }
    if (contentType?.includes('video/x-flv')) {
      return NextResponse.json({ success: true, type: 'flv' }, { status: 200 });
    }
    return NextResponse.json({ success: true, type: 'm3u8' }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isTimeout =
      error instanceof DOMException && error.name === 'TimeoutError';
    return NextResponse.json(
      { error: 'Failed to fetch', message },
      { status: isTimeout ? 504 : 500 }
    );
  }
}
