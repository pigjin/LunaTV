/* eslint-disable no-console, @typescript-eslint/no-explicit-any */

import { createClient, RedisClientType } from 'redis';

import { AdminConfig } from './admin.types';
import {
  Favorite,
  IStorage,
  PlayRecord,
  RefreshTokenRecord,
  SkipConfig,
} from './types';

// 搜索历史最大条数
const SEARCH_HISTORY_LIMIT = 20;

// 数据类型转换辅助函数
function ensureString(value: any): string {
  return String(value);
}

function ensureStringArray(value: any[]): string[] {
  return value.map((item) => String(item));
}

// 连接配置接口
export interface RedisConnectionConfig {
  url: string;
  clientName: string; // 用于日志显示，如 "Redis" 或 "Pika"
}

// 添加Redis操作重试包装器
function createRetryWrapper(
  clientName: string,
  getClient: () => RedisClientType,
) {
  return async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
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
          err.code === 'EPIPE';

        if (isConnectionError && !isLastAttempt) {
          console.log(
            `${clientName} operation failed, retrying... (${
              i + 1
            }/${maxRetries})`,
          );
          console.error('Error:', err.message);

          // 等待一段时间后重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));

          // 尝试重新连接
          try {
            const client = getClient();
            if (!client.isOpen) {
              await client.connect();
            }
          } catch (reconnectErr) {
            console.error('Failed to reconnect:', reconnectErr);
          }

          continue;
        }

        throw err;
      }
    }

    throw new Error('Max retries exceeded');
  };
}

// 创建客户端的工厂函数
export function createRedisClient(
  config: RedisConnectionConfig,
  globalSymbol: symbol,
): RedisClientType {
  let client: RedisClientType | undefined = (global as any)[globalSymbol];

  if (!client) {
    if (!config.url) {
      throw new Error(`${config.clientName}_URL env variable not set`);
    }

    // 创建客户端配置
    const clientConfig: any = {
      url: config.url,
      socket: {
        // 重连策略：指数退避，最大30秒
        reconnectStrategy: (retries: number) => {
          console.log(
            `${config.clientName} reconnection attempt ${retries + 1}`,
          );
          if (retries > 10) {
            console.error(
              `${config.clientName} max reconnection attempts exceeded`,
            );
            return false; // 停止重连
          }
          return Math.min(1000 * Math.pow(2, retries), 30000); // 指数退避，最大30秒
        },
        connectTimeout: 10000, // 10秒连接超时
        // 设置no delay，减少延迟
        noDelay: true,
      },
      // 添加其他配置
      pingInterval: 30000, // 30秒ping一次，保持连接活跃
    };

    client = createClient(clientConfig);

    // 添加错误事件监听
    client.on('error', (err) => {
      console.error(`${config.clientName} client error:`, err);
    });

    client.on('connect', () => {
      console.log(`${config.clientName} connected`);
    });

    client.on('reconnecting', () => {
      console.log(`${config.clientName} reconnecting...`);
    });

    client.on('ready', () => {
      console.log(`${config.clientName} ready`);
    });

    // 初始连接，带重试机制
    const connectWithRetry = async () => {
      try {
        await client!.connect();
        console.log(`${config.clientName} connected successfully`);
      } catch (err) {
        console.error(`${config.clientName} initial connection failed:`, err);
        console.log('Will retry in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      }
    };

    connectWithRetry();

    (global as any)[globalSymbol] = client;
  }

  return client;
}

// 抽象基类，包含所有通用的Redis操作逻辑
export abstract class BaseRedisStorage implements IStorage {
  protected client: RedisClientType;
  protected withRetry: <T>(
    operation: () => Promise<T>,
    maxRetries?: number,
  ) => Promise<T>;

  constructor(config: RedisConnectionConfig, globalSymbol: symbol) {
    this.client = createRedisClient(config, globalSymbol);
    this.withRetry = createRetryWrapper(config.clientName, () => this.client);
  }

  // ---------- 播放记录 ----------
  private prKey(user: string, key: string) {
    return `u:${user}:pr:${key}`; // u:username:pr:source+id
  }

  async getPlayRecord(
    userName: string,
    key: string,
  ): Promise<PlayRecord | null> {
    const val = await this.withRetry(() =>
      this.client.get(this.prKey(userName, key)),
    );
    return val ? (JSON.parse(val) as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.prKey(userName, key), JSON.stringify(record)),
    );
  }

  async getAllPlayRecords(
    userName: string,
  ): Promise<Record<string, PlayRecord>> {
    const pattern = `u:${userName}:pr:*`;
    const keys: string[] = await this.withRetry(() =>
      this.client.keys(pattern),
    );
    if (keys.length === 0) return {};
    const values = await this.withRetry(() => this.client.mGet(keys));
    const result: Record<string, PlayRecord> = {};
    keys.forEach((fullKey: string, idx: number) => {
      const raw = values[idx];
      if (raw) {
        const rec = JSON.parse(raw) as PlayRecord;
        // 截取 source+id 部分
        const keyPart = ensureString(fullKey.replace(`u:${userName}:pr:`, ''));
        result[keyPart] = rec;
      }
    });
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.prKey(userName, key)));
  }

  // ---------- 收藏 ----------
  private favKey(user: string, key: string) {
    return `u:${user}:fav:${key}`;
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await this.withRetry(() =>
      this.client.get(this.favKey(userName, key)),
    );
    return val ? (JSON.parse(val) as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.favKey(userName, key), JSON.stringify(favorite)),
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const pattern = `u:${userName}:fav:*`;
    const keys: string[] = await this.withRetry(() =>
      this.client.keys(pattern),
    );
    if (keys.length === 0) return {};
    const values = await this.withRetry(() => this.client.mGet(keys));
    const result: Record<string, Favorite> = {};
    keys.forEach((fullKey: string, idx: number) => {
      const raw = values[idx];
      if (raw) {
        const fav = JSON.parse(raw) as Favorite;
        const keyPart = ensureString(fullKey.replace(`u:${userName}:fav:`, ''));
        result[keyPart] = fav;
      }
    });
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await this.withRetry(() => this.client.del(this.favKey(userName, key)));
  }

  // ---------- 用户注册 / 登录 ----------
  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await this.withRetry(() =>
      this.client.set(this.userPwdKey(userName), password),
    );
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await this.withRetry(() =>
      this.client.get(this.userPwdKey(userName)),
    );
    if (stored === null) return false;
    // 确保比较时都是字符串类型
    return ensureString(stored) === password;
  }

  // 检查用户是否存在
  async checkUserExist(userName: string): Promise<boolean> {
    // 使用 EXISTS 判断 key 是否存在
    const exists = await this.withRetry(() =>
      this.client.exists(this.userPwdKey(userName)),
    );
    return exists === 1;
  }

  // 修改用户密码
  async changePassword(userName: string, newPassword: string): Promise<void> {
    // 简单存储明文密码，生产环境应加密
    await this.withRetry(() =>
      this.client.set(this.userPwdKey(userName), newPassword),
    );
  }

  // 删除用户及其所有数据
  async deleteUser(userName: string): Promise<void> {
    // 删除用户密码
    await this.withRetry(() => this.client.del(this.userPwdKey(userName)));

    // 删除搜索历史
    await this.withRetry(() => this.client.del(this.shKey(userName)));

    // 删除播放记录
    const playRecordPattern = `u:${userName}:pr:*`;
    const playRecordKeys = await this.withRetry(() =>
      this.client.keys(playRecordPattern),
    );
    if (playRecordKeys.length > 0) {
      await this.withRetry(() => this.client.del(playRecordKeys));
    }

    // 删除收藏夹
    const favoritePattern = `u:${userName}:fav:*`;
    const favoriteKeys = await this.withRetry(() =>
      this.client.keys(favoritePattern),
    );
    if (favoriteKeys.length > 0) {
      await this.withRetry(() => this.client.del(favoriteKeys));
    }

    // 删除跳过片头片尾配置
    const skipConfigPattern = `u:${userName}:skip:*`;
    const skipConfigKeys = await this.withRetry(() =>
      this.client.keys(skipConfigPattern),
    );
    if (skipConfigKeys.length > 0) {
      await this.withRetry(() => this.client.del(skipConfigKeys));
    }
  }

  // ---------- 搜索历史 ----------
  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const result = await this.withRetry(() =>
      this.client.lRange(this.shKey(userName), 0, -1),
    );
    // 确保返回的都是字符串类型
    return ensureStringArray(result as any[]);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    // 先去重
    await this.withRetry(() => this.client.lRem(key, 0, ensureString(keyword)));
    // 插入到最前
    await this.withRetry(() => this.client.lPush(key, ensureString(keyword)));
    // 限制最大长度
    await this.withRetry(() =>
      this.client.lTrim(key, 0, SEARCH_HISTORY_LIMIT - 1),
    );
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await this.withRetry(() =>
        this.client.lRem(key, 0, ensureString(keyword)),
      );
    } else {
      await this.withRetry(() => this.client.del(key));
    }
  }

  // ---------- 获取全部用户 ----------
  async getAllUsers(): Promise<string[]> {
    const keys = await this.withRetry(() => this.client.keys('u:*:pwd'));
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
    const val = await this.withRetry(() =>
      this.client.get(this.adminConfigKey()),
    );
    return val ? (JSON.parse(val) as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await this.withRetry(() =>
      this.client.set(this.adminConfigKey(), JSON.stringify(config)),
    );
  }

  // ---------- 跳过片头片尾配置 ----------
  private skipConfigKey(user: string, source: string, id: string) {
    return `u:${user}:skip:${source}+${id}`;
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<SkipConfig | null> {
    const val = await this.withRetry(() =>
      this.client.get(this.skipConfigKey(userName, source, id)),
    );
    return val ? (JSON.parse(val) as SkipConfig) : null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.set(
        this.skipConfigKey(userName, source, id),
        JSON.stringify(config),
      ),
    );
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string,
  ): Promise<void> {
    await this.withRetry(() =>
      this.client.del(this.skipConfigKey(userName, source, id)),
    );
  }

  async getAllSkipConfigs(
    userName: string,
  ): Promise<{ [key: string]: SkipConfig }> {
    const pattern = `u:${userName}:skip:*`;
    const keys = await this.withRetry(() => this.client.keys(pattern));

    if (keys.length === 0) {
      return {};
    }

    const configs: { [key: string]: SkipConfig } = {};

    // 批量获取所有配置
    const values = await this.withRetry(() => this.client.mGet(keys));

    keys.forEach((key, index) => {
      const value = values[index];
      if (value) {
        // 从key中提取source+id
        const match = key.match(/^u:.+?:skip:(.+)$/);
        if (match) {
          const sourceAndId = match[1];
          configs[sourceAndId] = JSON.parse(value as string) as SkipConfig;
        }
      }
    });

    return configs;
  }

  // ---------- Refresh Token 存储 ----------
  private refreshTokenKey(clientPlatform: string, token: string) {
    return `rt:${clientPlatform}:${token}`; // rt:refreshToken
  }

  private refreshTokenUserKey(username: string) {
    return `rtu:${username}`; // rtu:username - 存储用户的所有 refresh token
  }

  async storeRefreshToken(
    clientPlatform: string,
    refreshToken: string,
    payload: {
      username?: string;
      role: 'owner' | 'admin' | 'user';
      type: 'local' | 'db';
    },
    expiresIn: number, // 秒数
  ): Promise<void> {
    const now = Date.now();
    const expiresAt = now + expiresIn * 1000;

    const record: RefreshTokenRecord = {
      clientPlatform,
      refreshToken,
      username: payload.username,
      role: payload.role,
      type: payload.type,
      createdAt: now,
      expiresAt,
    };

    // 存储 refresh token 记录，并设置过期时间
    await this.withRetry(() =>
      this.client.set(
        this.refreshTokenKey(clientPlatform, refreshToken),
        JSON.stringify(record),
        { EX: expiresIn }, // Redis TTL，自动过期
      ),
    );

    // 如果有用户名，将 token 添加到用户的 token 集合中
    if (payload.username) {
      await this.withRetry(() =>
        this.client.hSet(
          this.refreshTokenUserKey(payload.username!),
          clientPlatform,
          refreshToken,
        ),
      );
    }
  }

  async getRefreshToken(
    clientPlatform: string,
    refreshToken: string,
  ): Promise<RefreshTokenRecord | null> {
    const val = await this.withRetry(() =>
      this.client.get(this.refreshTokenKey(clientPlatform, refreshToken)),
    );

    if (!val) {
      return null;
    }

    const record = JSON.parse(val) as RefreshTokenRecord;

    // 双重检查过期时间（虽然 Redis 有 TTL，但以防万一）
    if (record.expiresAt < Date.now()) {
      await this.revokeRefreshToken(clientPlatform, refreshToken);
      return null;
    }

    return record;
  }

  async revokeRefreshToken(
    clientPlatform: string,
    refreshToken: string,
  ): Promise<void> {
    // 先获取记录，以便从用户集合中移除
    const val = await this.withRetry(() =>
      this.client.get(this.refreshTokenKey(clientPlatform, refreshToken)),
    );

    if (val) {
      const record = JSON.parse(val) as RefreshTokenRecord;
      // 从用户的 token 集合中移除
      if (record.username) {
        await this.withRetry(() =>
          this.client.hDel(
            this.refreshTokenUserKey(record.username!),
            clientPlatform,
          ),
        );
      }
    }

    // 删除 token 记录
    await this.withRetry(() =>
      this.client.del(this.refreshTokenKey(clientPlatform, refreshToken)),
    );
  }

  async revokeUserRefreshTokens(
    clientPlatform: string,
    username?: string,
  ): Promise<void> {
    if (!username) {
      // 如果没有用户名，删除所有 local 类型的 token
      // 需要扫描所有 rt:* 的 key
      const pattern = `rt:${clientPlatform}:*`;
      const keys = await this.withRetry(() => this.client.keys(pattern));

      for (const key of keys) {
        const val = await this.withRetry(() => this.client.get(key));
        if (val) {
          const record = JSON.parse(val) as RefreshTokenRecord;
          if (record.type === 'local') {
            await this.withRetry(() => this.client.del(key));
          }
        }
      }
    } else {
      // 获取用户在该平台下的 token
      const token = await this.withRetry(() =>
        this.client.hGet(this.refreshTokenUserKey(username), clientPlatform),
      );

      if (token) {
        // 删除 token 记录
        await this.withRetry(() =>
          this.client.del(this.refreshTokenKey(clientPlatform, token)),
        );

        // 从用户的 token 集合中移除该平台的记录
        await this.withRetry(() =>
          this.client.hDel(this.refreshTokenUserKey(username), clientPlatform),
        );
      }
    }
  }

  async cleanupExpiredRefreshTokens(): Promise<void> {
    // Redis 有 TTL 自动清理，这里只是额外的清理逻辑
    // 清理用户集合中已失效的 token 引用
    const userKeyPattern = 'rtu:*';
    const userKeys = await this.withRetry(() =>
      this.client.keys(userKeyPattern),
    );

    for (const userKey of userKeys) {
      const tokens = await this.withRetry(() => this.client.hGetAll(userKey));

      for (const tokenKey in tokens) {
        // 检查 token 是否还存在
        const exists = await this.withRetry(() =>
          this.client.exists(this.refreshTokenKey(tokenKey, tokens[tokenKey])),
        );

        if (exists === 0) {
          // token 已过期或被删除，从集合中移除引用
          await this.withRetry(() => this.client.hDel(userKey, tokenKey));
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
      await this.withRetry(() => this.client.del(this.adminConfigKey()));

      // 删除所有 refresh token
      const rtKeys = await this.withRetry(() => this.client.keys('rt:*'));
      if (rtKeys.length > 0) {
        await this.withRetry(() => this.client.del(rtKeys));
      }

      const rtuKeys = await this.withRetry(() => this.client.keys('rtu:*'));
      if (rtuKeys.length > 0) {
        await this.withRetry(() => this.client.del(rtuKeys));
      }

      console.log('所有数据已清空');
    } catch (error) {
      console.error('清空数据失败:', error);
      throw new Error('清空数据失败');
    }
  }
}
