/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/proxy/segment:
 *   get:
 *     summary: 代理 HLS 媒体片段
 *     description: 按直播源配置的 User-Agent 代理获取 HLS TS 片段，并以流式响应返回。
 *     tags:
 *       - 代理
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 已编码的媒体片段地址
 *       - in: query
 *         name: moontv-source
 *         required: true
 *         schema:
 *           type: string
 *         description: 直播源标识，用于读取该直播源的 User-Agent
 *     responses:
 *       200:
 *         description: 返回 TS 媒体片段流
 *         headers:
 *           Content-Type:
 *             description: 固定为 video/mp2t
 *             schema:
 *               type: string
 *           Content-Length:
 *             description: 上游返回的内容长度
 *             schema:
 *               type: string
 *         content:
 *           video/mp2t:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: 缺少 url 参数
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 直播源不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 片段获取失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function GET(request: Request) {
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

  let response: Response | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  try {
    const decodedUrl = decodeURIComponent(url);
    response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': ua,
      },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch segment' },
        { status: 500 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', 'video/mp2t');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Range, Origin, Accept'
    );
    headers.set('Accept-Ranges', 'bytes');
    headers.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range'
    );
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    // 使用流式传输，避免占用内存
    const stream = new ReadableStream({
      start(controller) {
        if (!response?.body) {
          controller.close();
          return;
        }

        reader = response.body.getReader();
        const isCancelled = false;

        function pump() {
          if (isCancelled || !reader) {
            return;
          }

          reader
            .read()
            .then(({ done, value }) => {
              if (isCancelled) {
                return;
              }

              if (done) {
                controller.close();
                cleanup();
                return;
              }

              controller.enqueue(value);
              pump();
            })
            .catch((error) => {
              if (!isCancelled) {
                controller.error(error);
                cleanup();
              }
            });
        }

        function cleanup() {
          if (reader) {
            try {
              reader.releaseLock();
            } catch (e) {
              // reader 可能已经被释放，忽略错误
            }
            reader = null;
          }
        }

        pump();
      },
      cancel() {
        // 当流被取消时，确保释放所有资源
        if (reader) {
          try {
            reader.releaseLock();
          } catch (e) {
            // reader 可能已经被释放，忽略错误
          }
          reader = null;
        }

        if (response?.body) {
          try {
            response.body.cancel();
          } catch (e) {
            // 忽略取消时的错误
          }
        }
      },
    });

    return new Response(stream, { headers });
  } catch (error) {
    // 确保在错误情况下也释放资源
    if (reader) {
      try {
        (reader as ReadableStreamDefaultReader<Uint8Array>).releaseLock();
      } catch (e) {
        // 忽略错误
      }
    }

    if (response?.body) {
      try {
        response.body.cancel();
      } catch (e) {
        // 忽略错误
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch segment' },
      { status: 500 }
    );
  }
}
