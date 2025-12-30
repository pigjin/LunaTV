/* eslint-disable no-console */
/**
 * Refresh Token 存储管理器
 * 使用数据库持久化存储（Redis/Upstash/Kvrocks）
 * 同时保留内存缓存以提高性能
 */

import { db } from './db';
import { RefreshTokenRecord } from './types';

// 内存缓存（用于提高读取性能）
const tokenCache = new Map<string, RefreshTokenRecord>();

// 缓存过期检查间隔
let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * 启动清理过期token的定时任务
 */
function startCleanupTask() {
  if (cleanupInterval) {
    return;
  }

  // 每小时清理一次过期token缓存
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [token, record] of Array.from(tokenCache.entries())) {
      if (record.expiresAt < now) {
        tokenCache.delete(token);
      }
    }
    // 同时清理数据库中的过期引用
    db.cleanupExpiredRefreshTokens().catch((err) => {
      console.error('清理过期 refresh token 失败:', err);
    });
  }, 60 * 60 * 1000);
}

/**
 * 存储 refresh token
 */
export async function storeRefreshToken(
  refreshToken: string,
  payload: {
    username?: string;
    role: 'owner' | 'admin' | 'user';
    type: 'local' | 'db';
  },
  expiresIn: number // 秒数
): Promise<void> {
  const now = Date.now();
  const expiresAt = now + expiresIn * 1000;

  const record: RefreshTokenRecord = {
    refreshToken,
    username: payload.username,
    role: payload.role,
    type: payload.type,
    createdAt: now,
    expiresAt,
  };

  // 存储到数据库
  await db.storeRefreshToken(refreshToken, payload, expiresIn);

  // 同时存储到内存缓存
  tokenCache.set(refreshToken, record);

  // 启动清理任务
  startCleanupTask();
}

/**
 * 验证并获取 refresh token 记录
 * 先从内存缓存查找，如果没有则从数据库查找
 */
export async function verifyRefreshToken(
  refreshToken: string
): Promise<RefreshTokenRecord | null> {
  // 先检查内存缓存
  const cachedRecord = tokenCache.get(refreshToken);
  if (cachedRecord) {
    // 检查是否过期
    if (cachedRecord.expiresAt < Date.now()) {
      console.log('[verifyRefreshToken] Memory cache hit but expired');
      tokenCache.delete(refreshToken);
      // 从数据库中也删除
      await db.revokeRefreshToken(refreshToken);
      return null;
    }
    console.log('[verifyRefreshToken] Memory cache hit');
    return cachedRecord;
  }

  // 从数据库查找
  const dbRecord = await db.getRefreshToken(refreshToken);
  if (dbRecord) {
    console.log('[verifyRefreshToken] DB hit');
    // 添加到内存缓存
    tokenCache.set(refreshToken, dbRecord);
  } else {
    console.log('[verifyRefreshToken] Not found in DB');
  }

  return dbRecord;
}

/**
 * 删除 refresh token
 */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  // 从内存缓存删除
  tokenCache.delete(refreshToken);

  // 从数据库删除
  await db.revokeRefreshToken(refreshToken);
}

/**
 * 删除用户的所有 refresh token
 */
export async function revokeUserRefreshTokens(username?: string): Promise<void> {
  // 从内存缓存删除
  if (!username) {
    // 如果没有用户名，删除所有 local 类型的 token
    for (const [token, record] of Array.from(tokenCache.entries())) {
      if (record.type === 'local') {
        tokenCache.delete(token);
      }
    }
  } else {
    // 删除指定用户的所有 token
    for (const [token, record] of Array.from(tokenCache.entries())) {
      if (record.username === username) {
        tokenCache.delete(token);
      }
    }
  }

  // 从数据库删除
  await db.revokeUserRefreshTokens(username);
}

/**
 * 获取存储的 token 数量（用于调试）
 */
export function getTokenCount(): number {
  return tokenCache.size;
}
