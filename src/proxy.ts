/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { verifyAuth } from '@/lib/auth';
import { verifyJWT } from '@/lib/jwt';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过不需要认证的路径
  if (shouldSkipAuth(pathname)) {
    return NextResponse.next();
  }

  if (!process.env.PASSWORD) {
    // 如果没有设置密码，重定向到警告页面
    const warningUrl = new URL('/warning', request.url);
    return NextResponse.redirect(warningUrl);
  }

  if (pathname.startsWith('/api/proxy/')) {
    // 优先使用 Header Bearer Token
    const authInfo = await verifyAuth(request);
    if (authInfo) {
      return NextResponse.next();
    }

    // 向后兼容：支持 URL 参数中的 token（用于某些特殊场景）
    const token = request.nextUrl.searchParams.get('token');
    if (token) {
      const payload = await verifyJWT(token);
      if (payload) {
        return NextResponse.next();
      }
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 对于 API 路由：强制要求 Header Bearer Token 鉴权 (OAuth 2.0)
  if (pathname.startsWith('/api')) {
    const authInfo = await verifyAuth(request);
    if (!authInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // 对于页面路由：完全跳过服务端鉴权，交给客户端 (Client-Side Auth) 处理
  return NextResponse.next();
}

// 废弃此函数
/*
function handleAuthFailure(
  request: NextRequest,
  pathname: string
): NextResponse {
  // ...
}
*/

// 判断是否需要跳过认证的路径
function shouldSkipAuth(pathname: string): boolean {
  const skipPaths = [
    '/_next',
    '/favicon.ico',
    '/robots.txt',
    '/manifest.json',
    '/icons/',
    '/logo.png',
    '/screenshot.png',
    '/api/image-proxy',
    '/api/docs' // API 文档接口不需要认证
  ];

  return skipPaths.some((path) => pathname.startsWith(path));
}

// 配置middleware匹配规则
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|warning|api/login|api/register|api/logout|api/cron|api/server-config|api/docs).*)',
  ],
};
