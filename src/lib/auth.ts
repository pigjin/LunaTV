import { NextRequest } from 'next/server';

import { decodeJWT, JWTPayload, verifyJWT } from '@/lib/jwt';

/**
 * 验证并获取认证信息 (OAuth 2.0 风格，仅支持 Header Bearer Token)
 * @param request NextRequest 对象
 * @returns JWT Payload 或 null
 */
export async function verifyAuth(
  request: NextRequest
): Promise<JWTPayload | null> {
  // 从 Authorization Header 获取 Bearer Token
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  if (!token) {
    return null;
  }

  return await verifyJWT(token);
}

/**
 * 验证并获取认证信息 (向后兼容的别名)
 * @deprecated 使用 verifyAuth 代替
 */
export async function verifyAuthToken(
  request: NextRequest
): Promise<JWTPayload | null> {
  return verifyAuth(request);
}

/**
 * 验证并获取认证信息 (向后兼容的别名)
 * @deprecated 使用 verifyAuth 代替
 */
export async function getAuthInfoFromCookie(
  request: NextRequest
): Promise<JWTPayload | null> {
  return verifyAuth(request);
}

/**
 * 从 localStorage 获取认证信息 (客户端使用，不验证签名)
 * 支持新的 accessToken 和旧的 token key
 */
export function getAuthInfoFromStorage(): JWTPayload | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // 优先使用新的 accessToken key
    let token =
      localStorage.getItem('accessToken') ||
      localStorage.getItem('token'); // 向后兼容

    if (!token) {
      return null;
    }

    return decodeJWT(token);
  } catch (error) {
    return null;
  }
}

/**
 * 从 localStorage 获取认证信息 (向后兼容的别名)
 * @deprecated 使用 getAuthInfoFromStorage 代替
 */
export function getAuthInfoFromBrowserCookie(): JWTPayload | null {
  return getAuthInfoFromStorage();
}
