import { NextRequest } from 'next/server';

import { decodeJWT, JWTPayload, verifyJWT } from '@/lib/jwt';

// 验证并获取认证信息 (服务端使用，验证签名)
export async function verifyAuthToken(
  request: NextRequest
): Promise<JWTPayload | null> {
  let token: string | undefined;

  // 1. 优先尝试从 Header 获取
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  // 2. 如果 Header 没有，尝试从 Cookie 获取
  if (!token) {
    const cookie = request.cookies.get('auth');
    if (cookie) {
      token = cookie.value;
    }
  }

  if (!token) {
    return null;
  }

  return await verifyJWT(token);
}

// 兼容旧的函数名，但改为异步，因为 JWT 验证是异步的
// 注意：这个函数在之前的代码中是同步的，如果直接替换可能会报错。
// 需要检查调用处。大部分调用处是在 middleware 或 API routes，可以是异步的。
// 但是如果是同步调用，需要修改调用处。
// 先保留这个名字，但在内部调用 verifyJWT，并返回 Promise。
export async function getAuthInfoFromCookie(
  request: NextRequest
): Promise<JWTPayload | null> {
  return verifyAuthToken(request);
}

// 从localStorage获取认证信息 (客户端使用，不验证签名)
export function getAuthInfoFromBrowserCookie(): JWTPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      return null;
    }

    return decodeJWT(token);
  } catch (error) {
    return null;
  }
}
