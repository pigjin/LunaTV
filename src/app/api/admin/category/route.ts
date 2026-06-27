/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { verifyAuth } from '@/lib/auth';
import { getConfig, saveConfig } from '@/lib/config';

export const runtime = 'nodejs';

// 支持的操作类型
type Action = 'add' | 'disable' | 'enable' | 'delete' | 'sort';

interface BaseBody {
  action?: Action;
}

/**
 * @swagger
 * /api/admin/category:
 *   post:
 *     summary: 管理自定义豆瓣分类
 *     description: 管理员接口，支持新增、启用、禁用、删除和排序自定义豆瓣分类。
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
 *                 enum: [add, disable, enable, delete, sort]
 *                 description: 操作类型
 *               name:
 *                 type: string
 *                 description: 分类名称，add 时必填
 *               type:
 *                 type: string
 *                 enum: [movie, tv]
 *                 description: 分类类型，add/disable/enable/delete 时必填
 *               query:
 *                 type: string
 *                 description: 豆瓣查询参数，add/disable/enable/delete 时必填
 *               order:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 排序键列表，格式为 query:type，sort 时必填
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
 *         description: 参数错误、分类已存在或当前存储类型不支持管理员配置
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
 *         description: 分类不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 分类管理操作失败
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
      { status: 400 },
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
    const ACTIONS: Action[] = ['add', 'disable', 'enable', 'delete', 'sort'];
    if (!username || !action || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    // 获取配置与存储
    const adminConfig = await getConfig({ forceRefresh: true });

    // 权限与身份校验
    if (username !== process.env.USERNAME) {
      const userEntry = adminConfig.UserConfig.Users.find(
        (u) => u.username === username,
      );
      if (!userEntry || userEntry.role !== 'admin' || userEntry.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    switch (action) {
      case 'add': {
        const { name, type, query } = body as {
          name?: string;
          type?: 'movie' | 'tv';
          query?: string;
        };
        if (!name || !type || !query) {
          return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
        }
        // 检查是否已存在相同的查询和类型组合
        if (
          adminConfig.CustomCategories.some(
            (c) => c.query === query && c.type === type,
          )
        ) {
          return NextResponse.json({ error: '该分类已存在' }, { status: 400 });
        }
        adminConfig.CustomCategories.push({
          name,
          type,
          query,
          from: 'custom',
          disabled: false,
        });
        break;
      }
      case 'disable': {
        const { query, type } = body as {
          query?: string;
          type?: 'movie' | 'tv';
        };
        if (!query || !type)
          return NextResponse.json(
            { error: '缺少 query 或 type 参数' },
            { status: 400 },
          );
        const entry = adminConfig.CustomCategories.find(
          (c) => c.query === query && c.type === type,
        );
        if (!entry)
          return NextResponse.json({ error: '分类不存在' }, { status: 404 });
        entry.disabled = true;
        break;
      }
      case 'enable': {
        const { query, type } = body as {
          query?: string;
          type?: 'movie' | 'tv';
        };
        if (!query || !type)
          return NextResponse.json(
            { error: '缺少 query 或 type 参数' },
            { status: 400 },
          );
        const entry = adminConfig.CustomCategories.find(
          (c) => c.query === query && c.type === type,
        );
        if (!entry)
          return NextResponse.json({ error: '分类不存在' }, { status: 404 });
        entry.disabled = false;
        break;
      }
      case 'delete': {
        const { query, type } = body as {
          query?: string;
          type?: 'movie' | 'tv';
        };
        if (!query || !type)
          return NextResponse.json(
            { error: '缺少 query 或 type 参数' },
            { status: 400 },
          );
        const idx = adminConfig.CustomCategories.findIndex(
          (c) => c.query === query && c.type === type,
        );
        if (idx === -1)
          return NextResponse.json({ error: '分类不存在' }, { status: 404 });
        const entry = adminConfig.CustomCategories[idx];
        if (entry.from === 'config') {
          return NextResponse.json(
            { error: '该分类不可删除' },
            { status: 400 },
          );
        }
        adminConfig.CustomCategories.splice(idx, 1);
        break;
      }
      case 'sort': {
        const { order } = body as { order?: string[] };
        if (!Array.isArray(order)) {
          return NextResponse.json(
            { error: '排序列表格式错误' },
            { status: 400 },
          );
        }
        const map = new Map(
          adminConfig.CustomCategories.map((c) => [`${c.query}:${c.type}`, c]),
        );
        const newList: typeof adminConfig.CustomCategories = [];
        order.forEach((key) => {
          const item = map.get(key);
          if (item) {
            newList.push(item);
            map.delete(key);
          }
        });
        // 未在 order 中的保持原顺序
        adminConfig.CustomCategories.forEach((item) => {
          if (map.has(`${item.query}:${item.type}`)) newList.push(item);
        });
        adminConfig.CustomCategories = newList;
        break;
      }
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }

    // 持久化到存储
    await saveConfig(adminConfig);

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('分类管理操作失败:', error);
    return NextResponse.json(
      {
        error: '分类管理操作失败',
        details: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
