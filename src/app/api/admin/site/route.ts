/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { verifyAuth } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/admin/site:
 *   post:
 *     summary: 更新站点配置
 *     description: 管理员接口，更新站点名称、公告、搜索、豆瓣代理、内容过滤和 Web 直播开关等配置。
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
 *               - SiteName
 *               - Announcement
 *               - SearchDownstreamMaxPage
 *               - SiteInterfaceCacheTime
 *               - DoubanProxyType
 *               - DoubanProxy
 *               - DoubanImageProxyType
 *               - DoubanImageProxy
 *               - DisableYellowFilter
 *               - FluidSearch
 *               - EnableWebLive
 *             properties:
 *               SiteName:
 *                 type: string
 *                 description: 站点名称
 *               Announcement:
 *                 type: string
 *                 description: 站点公告
 *               SearchDownstreamMaxPage:
 *                 type: number
 *                 description: 搜索下游最大页数
 *               SiteInterfaceCacheTime:
 *                 type: number
 *                 description: 站点接口缓存时间，单位秒
 *               DoubanProxyType:
 *                 type: string
 *                 description: 豆瓣接口代理类型
 *               DoubanProxy:
 *                 type: string
 *                 description: 豆瓣接口代理地址
 *               DoubanImageProxyType:
 *                 type: string
 *                 description: 豆瓣图片代理类型
 *               DoubanImageProxy:
 *                 type: string
 *                 description: 豆瓣图片代理地址
 *               DisableYellowFilter:
 *                 type: boolean
 *                 description: 是否禁用黄色内容过滤
 *               FluidSearch:
 *                 type: boolean
 *                 description: 是否启用流式搜索
 *               EnableWebLive:
 *                 type: boolean
 *                 description: 是否启用 Web 直播
 *     responses:
 *       200:
 *         description: 更新成功
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
 *         description: 参数格式错误或当前存储类型不支持管理员配置
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
 *       500:
 *         description: 更新站点配置失败
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
    const body = await request.json();

    const authInfo = await verifyAuth(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    const {
      SiteName,
      Announcement,
      SearchDownstreamMaxPage,
      SiteInterfaceCacheTime,
      DoubanProxyType,
      DoubanProxy,
      DoubanImageProxyType,
      DoubanImageProxy,
      DisableYellowFilter,
      FluidSearch,
      EnableWebLive,
    } = body as {
      SiteName: string;
      Announcement: string;
      SearchDownstreamMaxPage: number;
      SiteInterfaceCacheTime: number;
      DoubanProxyType: string;
      DoubanProxy: string;
      DoubanImageProxyType: string;
      DoubanImageProxy: string;
      DisableYellowFilter: boolean;
      FluidSearch: boolean;
      EnableWebLive: boolean;
    };

    // 参数校验
    if (
      typeof SiteName !== 'string' ||
      typeof Announcement !== 'string' ||
      typeof SearchDownstreamMaxPage !== 'number' ||
      typeof SiteInterfaceCacheTime !== 'number' ||
      typeof DoubanProxyType !== 'string' ||
      typeof DoubanProxy !== 'string' ||
      typeof DoubanImageProxyType !== 'string' ||
      typeof DoubanImageProxy !== 'string' ||
      typeof DisableYellowFilter !== 'boolean' ||
      typeof FluidSearch !== 'boolean' ||
      typeof EnableWebLive !== 'boolean'
    ) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    const adminConfig = await getConfig();

    // 权限校验
    if (username !== process.env.USERNAME) {
      // 管理员
      const user = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!user || user.role !== 'admin' || user.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    // 更新缓存中的站点设置
    adminConfig.SiteConfig = {
      SiteName,
      Announcement,
      SearchDownstreamMaxPage,
      SiteInterfaceCacheTime,
      DoubanProxyType,
      DoubanProxy,
      DoubanImageProxyType,
      DoubanImageProxy,
      DisableYellowFilter,
      FluidSearch,
      EnableWebLive: EnableWebLive ?? false,
    };

    // 写入数据库
    await db.saveAdminConfig(adminConfig);

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store', // 不缓存结果
        },
      }
    );
  } catch (error) {
    console.error('更新站点配置失败:', error);
    return NextResponse.json(
      {
        error: '更新站点配置失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
