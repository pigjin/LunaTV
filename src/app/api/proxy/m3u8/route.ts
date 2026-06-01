/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { getBaseUrl, resolveUrl } from '@/lib/live';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/proxy/m3u8:
 *   get:
 *     summary: 代理并重写 M3U8 播放列表
 *     description: 按直播源配置的 User-Agent 获取 M3U8，必要时重写片段、密钥和嵌套 M3U8 地址为本地代理地址。
 *     tags:
 *       - 代理
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: 已编码的 M3U8 地址
 *       - in: query
 *         name: moontv-source
 *         required: true
 *         schema:
 *           type: string
 *         description: 直播源标识，用于读取该直播源的 User-Agent
 *       - in: query
 *         name: allowCORS
 *         required: false
 *         schema:
 *           type: boolean
 *           default: false
 *         description: 为 true 时保留原始片段地址，不改写为代理地址
 *       - in: query
 *         name: token
 *         required: false
 *         schema:
 *           type: string
 *         description: 重写代理 URL 时透传的访问令牌
 *     responses:
 *       200:
 *         description: 返回 M3U8 文本或上游媒体流
 *         headers:
 *           Content-Type:
 *             description: 上游内容类型
 *             schema:
 *               type: string
 *           Cache-Control:
 *             description: 缓存控制头
 *             schema:
 *               type: string
 *         content:
 *           application/vnd.apple.mpegurl:
 *             schema:
 *               type: string
 *           application/octet-stream:
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
 *         description: M3U8 获取失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const allowCORS = searchParams.get('allowCORS') === 'true';
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
  let responseUsed = false;

  try {
    const decodedUrl = decodeURIComponent(url);

    response = await fetch(decodedUrl, {
      cache: 'no-cache',
      redirect: 'follow',
      credentials: 'same-origin',
      headers: {
        'User-Agent': ua,
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch m3u8' },
        { status: 500 },
      );
    }

    const contentType = response.headers.get('Content-Type') || '';
    // rewrite m3u8
    if (
      contentType.toLowerCase().includes('mpegurl') ||
      contentType.toLowerCase().includes('octet-stream')
    ) {
      // 获取最终的响应URL（处理重定向后的URL）
      const finalUrl = response.url;
      const m3u8Content = await response.text();
      responseUsed = true; // 标记 response 已被使用

      // 使用最终的响应URL作为baseUrl，而不是原始的请求URL
      const baseUrl = getBaseUrl(finalUrl);

      // 重写 M3U8 内容
      const modifiedContent = rewriteM3U8Content(
        m3u8Content,
        baseUrl,
        request,
        allowCORS,
      );

      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set(
        'Access-Control-Allow-Headers',
        'Content-Type, Range, Origin, Accept',
      );
      headers.set('Cache-Control', 'no-cache');
      headers.set(
        'Access-Control-Expose-Headers',
        'Content-Length, Content-Range',
      );
      return new Response(modifiedContent, { headers });
    }
    // just proxy
    const headers = new Headers();
    headers.set(
      'Content-Type',
      response.headers.get('Content-Type') || 'application/vnd.apple.mpegurl',
    );
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Range, Origin, Accept',
    );
    headers.set('Cache-Control', 'no-cache');
    headers.set(
      'Access-Control-Expose-Headers',
      'Content-Length, Content-Range',
    );

    // 直接返回视频流
    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch m3u8' },
      { status: 500 },
    );
  } finally {
    // 确保 response 被正确关闭以释放资源
    if (response && !responseUsed) {
      try {
        response.body?.cancel();
      } catch (error) {
        // 忽略关闭时的错误
        console.warn('Failed to close response body:', error);
      }
    }
  }
}

function rewriteM3U8Content(
  content: string,
  baseUrl: string,
  req: Request,
  allowCORS: boolean,
) {
  const reqUrl = new URL(req.url);
  const token = reqUrl.searchParams.get('token');
  const source = reqUrl.searchParams.get('moontv-source');

  // 从 referer 头提取协议信息
  const referer = req.headers.get('referer');
  let protocol = 'http';
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      protocol = refererUrl.protocol.replace(':', '');
    } catch {
      // ignore
    }
  }

  const host = req.headers.get('host');
  const proxyBase = `${protocol}://${host}/api/proxy`;

  const buildProxyUrl = (path: 'segment' | 'key' | 'm3u8', target: string) => {
    if (allowCORS) {
      return target;
    }

    const u = new URL(`${proxyBase}/${path}`);
    u.searchParams.set('url', target);
    if (source) {
      u.searchParams.set('moontv-source', source);
    }
    if (token) {
      u.searchParams.set('token', token);
    }
    return u.toString();
  };

  const lines = content.split('\n');
  const rewrittenLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // 处理 TS 片段 URL 和其他媒体文件
    if (line && !line.startsWith('#')) {
      const resolvedUrl = resolveUrl(baseUrl, line);
      rewrittenLines.push(buildProxyUrl('segment', resolvedUrl));
      continue;
    }

    // 处理 EXT-X-MAP 标签中的 URI
    if (line.startsWith('#EXT-X-MAP:')) {
      line = rewriteMapUri(line, baseUrl, buildProxyUrl);
    }

    // 处理 EXT-X-KEY 标签中的 URI
    if (line.startsWith('#EXT-X-KEY:')) {
      line = rewriteKeyUri(line, baseUrl, buildProxyUrl);
    }

    // 处理嵌套的 M3U8 文件 (EXT-X-STREAM-INF)
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      rewrittenLines.push(line);
      // 下一行通常是 M3U8 URL
      if (i + 1 < lines.length) {
        i++;
        const nextLine = lines[i].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          const resolvedUrl = resolveUrl(baseUrl, nextLine);
          rewrittenLines.push(buildProxyUrl('m3u8', resolvedUrl));
        } else {
          rewrittenLines.push(nextLine);
        }
      }
      continue;
    }

    rewrittenLines.push(line);
  }

  return rewrittenLines.join('\n');
}

function rewriteMapUri(
  line: string,
  baseUrl: string,
  buildProxyUrl: (path: 'segment' | 'key' | 'm3u8', target: string) => string,
) {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    const originalUri = uriMatch[1];
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = buildProxyUrl('segment', resolvedUrl);
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

function rewriteKeyUri(
  line: string,
  baseUrl: string,
  buildProxyUrl: (path: 'segment' | 'key' | 'm3u8', target: string) => string,
) {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    const originalUri = uriMatch[1];
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = buildProxyUrl('key', resolvedUrl);
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}
