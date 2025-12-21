export const ACCESS_TOKEN_KEY = 'accessToken';
export const REFRESH_TOKEN_KEY = 'refreshToken';
// 向后兼容的旧key
export const TOKEN_KEY = 'token';

// 刷新token的锁，防止并发刷新
// 多个请求可以共享同一个刷新 Promise
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

/**
 * 获取 Access Token
 */
export function getAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  // 优先使用新的 key
  return (
    localStorage.getItem(ACCESS_TOKEN_KEY) ||
    localStorage.getItem(TOKEN_KEY) // 向后兼容
  );
}

/**
 * 获取 Refresh Token
 */
export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * 设置 Access Token 和 Refresh Token
 */
export function setTokens(
  accessToken: string,
  refreshToken?: string
): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(TOKEN_KEY, accessToken); // 向后兼容
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

/**
 * 设置 Access Token（单独设置）
 */
export function setAccessToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(TOKEN_KEY, token); // 向后兼容
}

/**
 * 设置 Refresh Token（单独设置）
 */
export function setRefreshToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

/**
 * 删除所有 token
 */
export function removeToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY); // 向后兼容
}

// 向后兼容的函数
export function getToken(): string | null {
  return getAccessToken();
}

export function setToken(token: string): void {
  setAccessToken(token);
}

/**
 * 刷新 Access Token (OAuth 2.0 风格)
 * 多个并发请求会共享同一个刷新操作
 * @returns 新的 access token，如果刷新失败返回null
 */
async function refreshAccessToken(): Promise<string | null> {
  // 如果正在刷新，等待当前的刷新请求
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        return null;
      }

      const res = await fetch('/api/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.accessToken) {
          // 更新 access token
          setAccessToken(data.accessToken);
          // 如果返回了新的 refresh token，也更新它
          if (data.refreshToken) {
            setRefreshToken(data.refreshToken);
          }
          return data.accessToken;
        }
      } else if (res.status === 401) {
        // Refresh token 无效，清除所有 token
        removeToken();
      }
      return null;
    } catch (error) {
      console.error('刷新token失败:', error);
      return null;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // 跳过刷新接口本身，避免无限循环
  if (url.includes('/api/refresh')) {
    return fetch(url, options);
  }

  // 获取当前 token
  let token = getAccessToken();
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // 发起请求
  let response = await fetch(url, {
    ...options,
    headers,
  });

  // 如果返回401，说明 token 过期，需要刷新
  if (response.status === 401) {
    // 触发 token 刷新（多个并发请求会共享同一个刷新操作）
    const newToken = await refreshAccessToken();

    if (newToken) {
      // 使用新 token 重试原始请求
      headers.set('Authorization', `Bearer ${newToken}`);
      response = await fetch(url, {
        ...options,
        headers,
      });
    }
    // 如果刷新失败，返回原始 401 响应
    // 调用方可以根据需要处理（如跳转登录页）
  }

  return response;
}
