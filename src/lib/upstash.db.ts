/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { Redis } from '@upstash/redis';

import { AdminConfig } from './admin.types';
import { Favorite, IStorage, PlayRecord, RefreshTokenRecord, SkipConfig } from './types';

// 搜索历史最大条数
const SEARCH_HISTORY_LIMIT = 20;

// 数据类型转换辅助函数
function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

// 添加Upstash Redis操作重试包装器
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      const isLastAttempt = i === maxRetries - 1;
      const isConnectionError =
        err.message?.includes('Connection') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ENOTFOUND') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE' ||
        err.name === 'UpstashError';

      if (isConnectionError && !isLastAttempt) {
        console.log(
          `Upstash Redis operation failed, retrying... (${i + 1}/${maxRetries})`
        );
        console.error('Error:', err.message);

        // 等待一段时间后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }

      throw err;
    }
  }

  throw new Error('Max retries exceeded');
}

export class UpstashRedisStorage implements IStorage {
  private client: Redis;

  constructor() {
    this.client = getUpstashRedisClient();
  }

  // ---------- 播放记录 ----------
  private prKey(user: string, key: string) {
    return `u:${user}:pr:${key}`; // u:username:pr:source+id
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const val = await withRetry(() =>
      this.client.get(this.prKey(userName, key))
    );
    return val ? (val as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    await withRetry(() => this.client.set(this.prKey(userName, key), record));
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const pattern = `u:${userName}:pr:*`;
    const keys: string[] = await withRetry(() => this.client.keys(pattern));
    if (keys.length === 0) return {};

    const result: Record<string, PlayRecord> = {};
    for (const fullKey of keys) {
      const value = await withRetry(() => this.client.get(fullKey));
      if (value) {
        // 截取 source+id 部分
        const keyPart = ensureString(fullKey.replace(`u:${userName}:pr:`, ''));
        result[keyPart] = value as PlayRecord;
      }
    }
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.prKey(userName, key)));
  }

  // ---------- 收藏 ----------
  private favKey(user: string, key: string) {
    return `u:${user}:fav:${key}`;
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await withRetry(() =>
      this.client.get(this.favKey(userName, key))
    );
    return val ? (val as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.favKey(userName, key), favorite)
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const pattern = `u:${userName}:fav:*`;
    const keys: string[] = await withRetry(() => this.client.keys(pattern));
    if (keys.length === 0) return {};

    const result: Record<string, Favorite> = {};
    for (const fullKey of keys) {
      const value = await withRetry(() => this.client.get(fullKey));
      if (value) {
        const keyPart = ensureString(fullKey.replace(`u:${userName}:fav:`, ''));
        result[keyPart] = value as Favorite;
      }
    }
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.favKey(userName, key)));
  }

  // ---------- 用户注册 / 登录 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await withRetry(() => this.client.set(this.userPwdKey(userName), password));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;
    // 确保比较时都是字符串类型
    return ensureString(stored) === password;
  }

  // 检查用户是否存在
  async checkUserExist(userName: string): Promise<boolean> {
    // 使用 EXISTS 判断 key 是否存在
    const exists = await withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  // 修改用户密码
  async changePassword(userName: string, newPassword: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await withRetry(() =>
      this.client.set(this.userPwdKey(userName), newPassword)
    );
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    // 删除用户密码
    await withRetry(() => this.client.del(this.userPwdKey(userName)));

    // 删除搜索历史
    await withRetry(() => this.client.del(this.shKey(userName)));

    // 删除播放记录
    const playRecordPattern = `u:${userName}:pr:*`;
    const playRecordKeys = await withRetry(() =>
      this.client.keys(playRecordPattern)
    );
    if (playRecordKeys.length > 0) {
      await withRetry(() => this.client.del(...playRecordKeys));
    }

    // 删除收藏夹
    const favoritePattern = `u:${userName}:fav:*`;
    const favoriteKeys = await withRetry(() =>
      this.client.keys(favoritePattern)
    );
    if (favoriteKeys.length > 0) {
      await withRetry(() => this.client.del(...favoriteKeys));
    }

    // 删除跳过片头片尾配置
    const skipConfigPattern = `u:${userName}:skip:*`;
    const skipConfigKeys = await withRetry(() =>
      this.client.keys(skipConfigPattern)
    );
    if (skipConfigKeys.length > 0) {
      await withRetry(() => this.client.del(...skipConfigKeys));
    }
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await withRetry(() =>
      this.client.lrange(this.shKey(userName), 0, -1)
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 先去重
    await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    // 插入到最前
    await withRetry(() => this.client.lpush(key, ensureString(keyword)));
    // 限制最大长度
    await withRetry(() => this.client.ltrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await withRetry(() => this.client.lrem(key, 0, ensureString(keyword)));
    } else {
      await withRetry(() => this.client.del(key));
    }
  }

  // ---------- 获取全部用户 ----------
  async getAllUsers(): Promise<string[]> {
    const keys = await withRetry(() => this.client.keys('u:*:pwd'));
    return keys
      .map((k) => {
        const match = k.match(/^u:(.+?):pwd$/);
        return match ? ensureString(match[1]) : undefined;
      })
      .filter((u): u is string => typeof u === 'string');
  }

  // ---------- 管理员配置 ----------
  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await withRetry(() => this.client.get(this.adminConfigKey()));
    return val ? (val as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await withRetry(() => this.client.set(this.adminConfigKey(), config));
  }

  // ---------- 跳过片头片尾配置 ----------
  private skipConfigKey(user: string, source: string, id: string) {
    return `u:${user}:skip:${source}+${id}`;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null> {
    const val = await withRetry(() =>
      this.client.get(this.skipConfigKey(userName, source, id))
    );
    return val ? (val as SkipConfig) : null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.skipConfigKey(userName, source, id), config)
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    await withRetry(() =>
      this.client.del(this.skipConfigKey(userName, source, id))
    );
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: SkipConfig }> {
    const pattern = `u:${userName}:skip:*`;
    const keys = await withRetry(() => this.client.keys(pattern));

    if (keys.length === 0) {
      return {};
    }

    const configs: { [key: string]: SkipConfig } = {};

    // 批量获取所有配置
    const values = await withRetry(() => this.client.mget(keys));

    keys.forEach((key, index) => {
      const value = values[index];
      if (value) {
        // 从key中提取source+id
        const match = key.match(/^u:.+?:skip:(.+)$/);
        if (match) {
          const sourceAndId = match[1];
          configs[sourceAndId] = value as SkipConfig;
        }
      }
    });

    return configs;
  }

  // ---------- Refresh Token 存储 ----------
  private refreshTokenKey(token: string) {
    return `rt:${token}`; // rt:refreshToken
  }

  private refreshTokenUserKey(username: string) {
    return `rtu:${username}`; // rtu:username - 存储用户的所有 refresh token
  }

  async storeRefreshToken(
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

    // 存储 refresh token 记录，并设置过期时间
    await withRetry(() =>
      this.client.set(
        this.refreshTokenKey(refreshToken),
        JSON.stringify(record),
        { ex: expiresIn } // Upstash Redis TTL，自动过期
      )
    );

    // 如果有用户名，将 token 添加到用户的 token 集合中
    if (payload.username) {
      await withRetry(() =>
        this.client.sadd(this.refreshTokenUserKey(payload.username!), refreshToken)
      );
    }
  }

  async getRefreshToken(
    refreshToken: string
  ): Promise<RefreshTokenRecord | null> {
    const val = await withRetry(() =>
      this.client.get(this.refreshTokenKey(refreshToken))
    );

    if (!val) {
      return null;
    }

    // Upstash 返回的可能是已解析的对象或字符串
    const record = typeof val === 'string' ? JSON.parse(val) : val as RefreshTokenRecord;

    // 双重检查过期时间（虽然 Redis 有 TTL，但以防万一）
    if (record.expiresAt < Date.now()) {
      await this.revokeRefreshToken(refreshToken);
      return null;
    }

    return record;
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    // 先获取记录，以便从用户集合中移除
    const val = await withRetry(() =>
      this.client.get(this.refreshTokenKey(refreshToken))
    );

    if (val) {
      const record = typeof val === 'string' ? JSON.parse(val) : val as RefreshTokenRecord;
      // 从用户的 token 集合中移除
      if (record.username) {
        await withRetry(() =>
          this.client.srem(this.refreshTokenUserKey(record.username!), refreshToken)
        );
      }
    }

    // 删除 token 记录
    await withRetry(() =>
      this.client.del(this.refreshTokenKey(refreshToken))
    );
  }

  async revokeUserRefreshTokens(username?: string): Promise<void> {
    if (!username) {
      // 如果没有用户名，删除所有 local 类型的 token
      // 需要扫描所有 rt:* 的 key
      const pattern = 'rt:*';
      const keys = await withRetry(() => this.client.keys(pattern));

      for (const key of keys) {
        const val = await withRetry(() => this.client.get(key));
        if (val) {
          const record = typeof val === 'string' ? JSON.parse(val) : val as RefreshTokenRecord;
          if (record.type === 'local') {
            await withRetry(() => this.client.del(key));
          }
        }
      }
    } else {
      // 获取用户的所有 token
      const tokens = await withRetry(() =>
        this.client.smembers(this.refreshTokenUserKey(username))
      );

      // 删除所有 token 记录
      for (const token of tokens) {
        await withRetry(() =>
          this.client.del(this.refreshTokenKey(token))
        );
      }

      // 删除用户的 token 集合
      await withRetry(() =>
        this.client.del(this.refreshTokenUserKey(username))
      );
    }
  }

  async cleanupExpiredRefreshTokens(): Promise<void> {
    // Redis 有 TTL 自动清理，这里只是额外的清理逻辑
    // 清理用户集合中已失效的 token 引用
    const userKeyPattern = 'rtu:*';
    const userKeys = await withRetry(() => this.client.keys(userKeyPattern));

    for (const userKey of userKeys) {
      const tokens = await withRetry(() => this.client.smembers(userKey));

      for (const token of tokens) {
        // 检查 token 是否还存在
        const exists = await withRetry(() =>
          this.client.exists(this.refreshTokenKey(token))
        );

        if (exists === 0) {
          // token 已过期或被删除，从集合中移除引用
          await withRetry(() => this.client.srem(userKey, token));
        }
      }
    }
  }

  // 清空所有数据
  async clearAllData(): Promise<void> {
    try {
      // 获取所有用户
      const allUsers = await this.getAllUsers();

      // 删除所有用户及其数据
      for (const username of allUsers) {
        await this.deleteUser(username);
      }

      // 删除管理员配置
      await withRetry(() => this.client.del(this.adminConfigKey()));

      // 删除所有 refresh token
      const rtKeys = await withRetry(() => this.client.keys('rt:*'));
      if (rtKeys.length > 0) {
        await withRetry(() => this.client.del(...rtKeys));
      }

      const rtuKeys = await withRetry(() => this.client.keys('rtu:*'));
      if (rtuKeys.length > 0) {
        await withRetry(() => this.client.del(...rtuKeys));
      }

      console.log('所有数据已清空');
    } catch (error) {
      console.error('清空数据失败:', error);
      throw new Error('清空数据失败');
    }
  }
}

// 单例 Upstash Redis 客户端
function getUpstashRedisClient(): Redis {
  const globalKey = Symbol.for('__MOONTV_UPSTASH_REDIS_CLIENT__');
  let client: Redis | undefined = (global as any)[globalKey];

  if (!client) {
    const upstashUrl = process.env.UPSTASH_URL;
    const upstashToken = process.env.UPSTASH_TOKEN;

    if (!upstashUrl || !upstashToken) {
      throw new Error(
        'UPSTASH_URL and UPSTASH_TOKEN env variables must be set'
      );
    }

    // 创建 Upstash Redis 客户端
    client = new Redis({
      url: upstashUrl,
      token: upstashToken,
      // 可选配置
      retry: {
        retries: 3,
        backoff: (retryCount: number) =>
          Math.min(1000 * Math.pow(2, retryCount), 30000),
      },
    });

    console.log('Upstash Redis client created successfully');

    (global as any)[globalKey] = client;
  }

  return client;
}
