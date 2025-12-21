/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { CURRENT_VERSION } from '@/lib/version';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/server-config:
 *   get:
 *     summary: 获取服务器配置
 *     description: 获取站点名称、存储类型和版本信息
 *     tags:
 *       - 其他
 *     responses:
 *       200:
 *         description: 返回服务器配置信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 SiteName:
 *                   type: string
 *                   description: 站点名称
 *                 StorageType:
 *                   type: string
 *                   enum: [localstorage, redis, upstash, kvrocks]
 *                   description: 存储类型
 *                 Version:
 *                   type: string
 *                   description: 当前版本号
 */
export async function GET(request: NextRequest) {
  console.log('server-config called: ', request.url);

  const config = await getConfig();
  const result = {
    SiteName: config.SiteConfig.SiteName,
    StorageType: process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    Version: CURRENT_VERSION,
  };
  return NextResponse.json(result);
}
