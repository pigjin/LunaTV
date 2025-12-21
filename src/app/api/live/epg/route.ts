import { NextRequest, NextResponse } from 'next/server';

import { getCachedLiveChannels } from '@/lib/live';

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/live/epg:
 *   get:
 *     summary: 获取直播节目单
 *     description: 根据直播源和频道tvg-id获取节目单信息
 *     tags:
 *       - 直播
 *     parameters:
 *       - in: query
 *         name: source
 *         required: true
 *         schema:
 *           type: string
 *         description: 直播源标识
 *       - in: query
 *         name: tvgId
 *         required: true
 *         schema:
 *           type: string
 *         description: 频道tvg-id
 *     responses:
 *       200:
 *         description: 返回节目单信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tvgId:
 *                       type: string
 *                     source:
 *                       type: string
 *                     epgUrl:
 *                       type: string
 *                     programs:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: 缺少必要参数
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 获取节目单信息失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sourceKey = searchParams.get('source');
    const tvgId = searchParams.get('tvgId');

    if (!sourceKey) {
      return NextResponse.json({ error: '缺少直播源参数' }, { status: 400 });
    }

    if (!tvgId) {
      return NextResponse.json(
        { error: '缺少频道tvg-id参数' },
        { status: 400 }
      );
    }

    const channelData = await getCachedLiveChannels(sourceKey);

    if (!channelData) {
      // 频道信息未找到时返回空的节目单数据
      return NextResponse.json({
        success: true,
        data: {
          tvgId,
          source: sourceKey,
          epgUrl: '',
          programs: [],
        },
      });
    }

    // 从epgs字段中获取对应tvgId的节目单信息
    const epgData = channelData.epgs[tvgId] || [];

    return NextResponse.json({
      success: true,
      data: {
        tvgId,
        source: sourceKey,
        epgUrl: channelData.epgUrl,
        programs: epgData,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: '获取节目单信息失败' }, { status: 500 });
  }
}
