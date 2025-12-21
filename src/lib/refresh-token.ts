/* eslint-disable no-console */
/**
 * Refresh Token 存储管理器
 * 使用内存存储，服务重启后会丢失（可后续改为数据库存储）
 */

interface RefreshTokenRecord {
  refreshToken: string;
  username?: string;
  role: 'owner' | 'admin' | 'user';
  type: 'local' | 'db';
  createdAt: number;
  expiresAt: number;
}

// 内存存储
const tokenStore = new Map<string, RefreshTokenRecord>();

// 清理过期token的定时器
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * 启动清理过期token的定时任务
 */
function startCleanupTask() {
  if (cleanupInterval) {
    return;
  }

  // 每小时清理一次过期token
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [token, record] of tokenStore.entries()) {
      if (record.expiresAt < now) {
        tokenStore.delete(token);
      }
    }
  }, 60 * 60 * 1000);
}

/**
 * 存储 refresh token
 */
export function storeRefreshToken(
  refreshToken: string,
  payload: {
    username?: string;
    role: 'owner' | 'admin' | 'user';
    type: 'local' | 'db';
  },
  expiresIn: number // 秒数
): void {
  const now = Date.now();
  const expiresAt = now + expiresIn * 1000;

  tokenStore.set(refreshToken, {
    refreshToken,
    username: payload.username,
    role: payload.role,
    type: payload.type,
    createdAt: now,
    expiresAt,
  });

  // 启动清理任务
  startCleanupTask();
}

/**
 * 验证并获取 refresh token 记录
 */
export function verifyRefreshToken(
  refreshToken: string
): RefreshTokenRecord | null {
  const record = tokenStore.get(refreshToken);
  if (!record) {
    return null;
  }

  // 检查是否过期
  if (record.expiresAt < Date.now()) {
    tokenStore.delete(refreshToken);
    return null;
  }

  return record;
}

/**
 * 删除 refresh token
 */
export function revokeRefreshToken(refreshToken: string): void {
  tokenStore.delete(refreshToken);
}

/**
 * 删除用户的所有 refresh token
 */
export function revokeUserRefreshTokens(username?: string): void {
  if (!username) {
    // 如果没有用户名，删除所有 local 类型的 token
    for (const [token, record] of tokenStore.entries()) {
      if (record.type === 'local') {
        tokenStore.delete(token);
      }
    }
  } else {
    // 删除指定用户的所有 token
    for (const [token, record] of tokenStore.entries()) {
      if (record.username === username) {
        tokenStore.delete(token);
      }
    }
  }
}

/**
 * 获取存储的 token 数量（用于调试）
 */
export function getTokenCount(): number {
  return tokenStore.size;
}

