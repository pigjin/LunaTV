/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';
import { promisify } from 'util';
import { gunzip } from 'zlib';

import { AdminConfig } from '@/lib/admin.types';
import { verifyAuth } from '@/lib/auth';
import { configSelfCheck, saveConfig } from '@/lib/config';
import { SimpleCrypto } from '@/lib/crypto';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const gunzipAsync = promisify(gunzip);

interface MigrationUserData {
  password?: string | null;
  playRecords?: Record<string, any>;
  favorites?: Record<string, any>;
  searchHistory?: string[];
  skipConfigs?: Record<string, any>;
}

interface MigrationSnapshot {
  adminConfig: AdminConfig | null;
  userData: Record<string, MigrationUserData>;
}

/**
 * @swagger
 * /api/admin/data_migration/import:
 *   post:
 *     summary: 导入备份数据
 *     description: 站长接口，上传并解密备份文件，清空现有数据后导入管理员配置和用户数据。
 *     tags:
 *       - 管理
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - password
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 由导出接口生成的 .dat 备份文件
 *               password:
 *                 type: string
 *                 description: 解密备份文件的密码
 *     responses:
 *       200:
 *         description: 数据导入成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 importedUsers:
 *                   type: integer
 *                   description: 导入的用户数量
 *                 timestamp:
 *                   type: string
 *                   description: 备份生成时间
 *                 serverVersion:
 *                   type: string
 *                   description: 备份文件中的服务端版本
 *       400:
 *         description: 当前存储类型不支持数据迁移、缺少文件/密码、解密失败或备份格式错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录或非站长用户
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 导入失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function POST(req: NextRequest) {
  try {
    // 检查存储类型
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    if (storageType === 'localstorage') {
      return NextResponse.json(
        { error: '不支持本地存储进行数据迁移' },
        { status: 400 },
      );
    }

    // 验证身份和权限
    const authInfo = await verifyAuth(req);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    // 检查用户权限（只有站长可以导入数据）
    if (authInfo.username !== process.env.USERNAME) {
      return NextResponse.json(
        { error: '权限不足，只有站长可以导入数据' },
        { status: 401 },
      );
    }

    // 解析表单数据
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const password = formData.get('password') as string;

    if (!file) {
      return NextResponse.json({ error: '请选择备份文件' }, { status: 400 });
    }

    if (!password) {
      return NextResponse.json({ error: '请提供解密密码' }, { status: 400 });
    }

    // 读取文件内容
    const encryptedData = await file.text();

    // 解密数据
    let decryptedData: string;
    try {
      decryptedData = SimpleCrypto.decrypt(encryptedData, password);
    } catch {
      return NextResponse.json(
        { error: '解密失败，请检查密码是否正确' },
        { status: 400 },
      );
    }

    // 解压缩数据
    const compressedBuffer = Buffer.from(decryptedData, 'base64');
    const decompressedBuffer = await gunzipAsync(compressedBuffer);
    const decompressedData = decompressedBuffer.toString();

    // 解析JSON数据
    let importData: any;
    try {
      importData = JSON.parse(decompressedData);
    } catch {
      return NextResponse.json({ error: '备份文件格式错误' }, { status: 400 });
    }

    // 验证数据格式
    if (
      !importData.data ||
      !importData.data.adminConfig ||
      !importData.data.userData ||
      typeof importData.data.userData !== 'object'
    ) {
      return NextResponse.json({ error: '备份文件格式无效' }, { status: 400 });
    }

    const checkedAdminConfig = configSelfCheck(importData.data.adminConfig);
    const userData = importData.data.userData as Record<
      string,
      MigrationUserData
    >;
    const snapshot = await createCurrentDataSnapshot();
    let clearedCurrentData = false;

    try {
      // 开始导入数据 - 已完整校验后才清空现有数据
      await db.clearAllData();
      clearedCurrentData = true;

      // 导入管理员配置
      await saveConfig(checkedAdminConfig);

      // 导入用户数据
      await importUserData(userData);
    } catch (error) {
      if (clearedCurrentData) {
        try {
          await restoreDataSnapshot(snapshot);
        } catch (restoreError) {
          console.error('导入失败后恢复原数据失败:', restoreError);
        }
      }
      throw error;
    }

    return NextResponse.json({
      message: '数据导入成功',
      importedUsers: Object.keys(userData).length,
      timestamp: importData.timestamp,
      serverVersion:
        typeof importData.serverVersion === 'string'
          ? importData.serverVersion
          : '未知版本',
    });
  } catch (error) {
    console.error('数据导入失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '导入失败' },
      { status: 500 },
    );
  }
}

async function createCurrentDataSnapshot(): Promise<MigrationSnapshot> {
  const adminConfig = await db.getAdminConfig();
  const users = await db.getAllUsers();
  if (process.env.USERNAME && !users.includes(process.env.USERNAME)) {
    users.push(process.env.USERNAME);
  }

  const uniqueUsers = Array.from(new Set(users));
  const userData: Record<string, MigrationUserData> = {};
  for (const username of uniqueUsers) {
    userData[username] = {
      password:
        username === process.env.USERNAME
          ? process.env.PASSWORD || null
          : await getStoredUserPassword(username),
      playRecords: await db.getAllPlayRecords(username),
      favorites: await db.getAllFavorites(username),
      searchHistory: await db.getSearchHistory(username),
      skipConfigs: await db.getAllSkipConfigs(username),
    };
  }

  return {
    adminConfig,
    userData,
  };
}

async function restoreDataSnapshot(snapshot: MigrationSnapshot): Promise<void> {
  await db.clearAllData();
  if (snapshot.adminConfig) {
    await saveConfig(snapshot.adminConfig);
  }
  await importUserData(snapshot.userData);
}

async function importUserData(
  userData: Record<string, MigrationUserData>,
): Promise<void> {
  for (const username in userData) {
    const user = userData[username];

    if (user.password) {
      await db.restoreUserPassword(username, user.password);
    }

    if (user.playRecords) {
      for (const [key, record] of Object.entries(user.playRecords)) {
        await (db as any).storage.setPlayRecord(username, key, record);
      }
    }

    if (user.favorites) {
      for (const [key, favorite] of Object.entries(user.favorites)) {
        await (db as any).storage.setFavorite(username, key, favorite);
      }
    }

    if (Array.isArray(user.searchHistory)) {
      for (const keyword of [...user.searchHistory].reverse()) {
        await db.addSearchHistory(username, keyword);
      }
    }

    if (user.skipConfigs) {
      for (const [key, skipConfig] of Object.entries(user.skipConfigs)) {
        const parsedKey = parseStorageKey(key);
        if (parsedKey) {
          await db.setSkipConfig(
            username,
            parsedKey.source,
            parsedKey.id,
            skipConfig as any,
          );
        }
      }
    }
  }
}

function parseStorageKey(key: string): { source: string; id: string } | null {
  const separatorIndex = key.indexOf('+');
  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }

  return {
    source: key.slice(0, separatorIndex),
    id: key.slice(separatorIndex + 1),
  };
}

async function getStoredUserPassword(username: string): Promise<string | null> {
  try {
    const storage = (db as any).storage;
    if (storage && typeof storage.client?.get === 'function') {
      const password = await storage.client.get(`u:${username}:pwd`);
      return typeof password === 'string' ? password : null;
    }
  } catch (error) {
    console.error(`获取用户 ${username} 密码失败:`, error);
  }

  return null;
}
