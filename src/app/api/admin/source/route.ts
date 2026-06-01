/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { verifyAuth } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

// 支持的操作类型
type Action =
  | 'add'
  | 'disable'
  | 'enable'
  | 'delete'
  | 'sort'
  | 'batch_disable'
  | 'batch_enable'
  | 'batch_delete';

interface BaseBody {
  action?: Action;
}

/**
 * @swagger
 * /api/admin/source:
 *   post:
 *     summary: 管理视频源
 *     description: 管理员接口，支持新增、启用、禁用、删除、批量操作和排序视频源。
 *     tags:
 *       - 管理
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [add, disable, enable, delete, sort, batch_disable, batch_enable, batch_delete]
 *                 description: 操作类型
 *               key:
 *                 type: string
 *                 description: 视频源标识，add/disable/enable/delete 时使用
 *               name:
 *                 type: string
 *                 description: 视频源名称，add 时必填
 *               api:
 *                 type: string
 *                 description: 视频源 API 地址，add 时必填
 *               detail:
 *                 type: string
 *                 description: 视频源详情页地址，可选
 *               keys:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 批量操作的视频源标识列表
 *               order:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 排序后的视频源 key 列表，sort 时必填
 *     responses:
 *       200:
 *         description: 操作成功
 *         headers:
 *           Cache-Control:
 *             description: 缓存控制头
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: 参数错误、视频源已存在、视频源不可删除或当前存储类型不支持管理员配置
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录或权限不足
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 视频源不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 视频源管理操作失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 */
export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as BaseBody & Record<string, any>;
    const { action } = body;

    const authInfo = await verifyAuth(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    // 基础校验
    const ACTIONS: Action[] = [
      'add',
      'disable',
      'enable',
      'delete',
      'sort',
      'batch_disable',
      'batch_enable',
      'batch_delete',
    ];
    if (!username || !action || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    // 获取配置与存储
    const adminConfig = await getConfig();

    // 权限与身份校验
    if (username !== process.env.USERNAME) {
      const userEntry = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!userEntry || userEntry.role !== 'admin' || userEntry.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    switch (action) {
      case 'add': {
        const { key, name, api, detail } = body as {
          key?: string;
          name?: string;
          api?: string;
          detail?: string;
        };
        if (!key || !name || !api) {
          return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
        }
        if (adminConfig.SourceConfig.some((s) => s.key === key)) {
          return NextResponse.json({ error: '该源已存在' }, { status: 400 });
        }
        adminConfig.SourceConfig.push({
          key,
          name,
          api,
          detail,
          from: 'custom',
          disabled: false,
        });
        break;
      }
      case 'disable': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        entry.disabled = true;
        break;
      }
      case 'enable': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        entry.disabled = false;
        break;
      }
      case 'delete': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const idx = adminConfig.SourceConfig.findIndex((s) => s.key === key);
        if (idx === -1)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        const entry = adminConfig.SourceConfig[idx];
        if (entry.from === 'config') {
          return NextResponse.json({ error: '该源不可删除' }, { status: 400 });
        }
        adminConfig.SourceConfig.splice(idx, 1);

        // 检查并清理用户组和用户的权限数组
        // 清理用户组权限
        if (adminConfig.UserConfig.Tags) {
          adminConfig.UserConfig.Tags.forEach((tag) => {
            if (tag.enabledApis) {
              tag.enabledApis = tag.enabledApis.filter((api) => api !== key);
            }
          });
        }

        // 清理用户权限
        adminConfig.UserConfig.Users.forEach((user) => {
          if (user.enabledApis) {
            user.enabledApis = user.enabledApis.filter((api) => api !== key);
          }
        });
        break;
      }
      case 'batch_disable': {
        const { keys } = body as { keys?: string[] };
        if (!Array.isArray(keys) || keys.length === 0) {
          return NextResponse.json(
            { error: '缺少 keys 参数或为空' },
            { status: 400 }
          );
        }
        keys.forEach((key) => {
          const entry = adminConfig.SourceConfig.find((s) => s.key === key);
          if (entry) {
            entry.disabled = true;
          }
        });
        break;
      }
      case 'batch_enable': {
        const { keys } = body as { keys?: string[] };
        if (!Array.isArray(keys) || keys.length === 0) {
          return NextResponse.json(
            { error: '缺少 keys 参数或为空' },
            { status: 400 }
          );
        }
        keys.forEach((key) => {
          const entry = adminConfig.SourceConfig.find((s) => s.key === key);
          if (entry) {
            entry.disabled = false;
          }
        });
        break;
      }
      case 'batch_delete': {
        const { keys } = body as { keys?: string[] };
        if (!Array.isArray(keys) || keys.length === 0) {
          return NextResponse.json(
            { error: '缺少 keys 参数或为空' },
            { status: 400 }
          );
        }
        // 过滤掉 from=config 的源，但不报错
        const keysToDelete = keys.filter((key) => {
          const entry = adminConfig.SourceConfig.find((s) => s.key === key);
          return entry && entry.from !== 'config';
        });

        // 批量删除
        keysToDelete.forEach((key) => {
          const idx = adminConfig.SourceConfig.findIndex((s) => s.key === key);
          if (idx !== -1) {
            adminConfig.SourceConfig.splice(idx, 1);
          }
        });

        // 检查并清理用户组和用户的权限数组
        if (keysToDelete.length > 0) {
          // 清理用户组权限
          if (adminConfig.UserConfig.Tags) {
            adminConfig.UserConfig.Tags.forEach((tag) => {
              if (tag.enabledApis) {
                tag.enabledApis = tag.enabledApis.filter(
                  (api) => !keysToDelete.includes(api)
                );
              }
            });
          }

          // 清理用户权限
          adminConfig.UserConfig.Users.forEach((user) => {
            if (user.enabledApis) {
              user.enabledApis = user.enabledApis.filter(
                (api) => !keysToDelete.includes(api)
              );
            }
          });
        }
        break;
      }
      case 'sort': {
        const { order } = body as { order?: string[] };
        if (!Array.isArray(order)) {
          return NextResponse.json(
            { error: '排序列表格式错误' },
            { status: 400 }
          );
        }
        const map = new Map(adminConfig.SourceConfig.map((s) => [s.key, s]));
        const newList: typeof adminConfig.SourceConfig = [];
        order.forEach((k) => {
          const item = map.get(k);
          if (item) {
            newList.push(item);
            map.delete(k);
          }
        });
        // 未在 order 中的保持原顺序
        adminConfig.SourceConfig.forEach((item) => {
          if (map.has(item.key)) newList.push(item);
        });
        adminConfig.SourceConfig = newList;
        break;
      }
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }

    // 持久化到存储
    await db.saveAdminConfig(adminConfig);

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('视频源管理操作失败:', error);
    return NextResponse.json(
      {
        error: '视频源管理操作失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
