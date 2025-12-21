import { NextResponse } from 'next/server';

import { fetchBangumiData } from '@/lib/bangumi';
import { getCacheTime } from '@/lib/config';
import { MovieItem,MovieResult } from '@/lib/types';

interface BangumiCalendarApiResponse {
  weekday: {
    id: number;
    cn: string;
    en: string;
    ja: string;
  };
  items: {
    id: number;
    name: string;
    name_cn: string;
    rating: {
      score: number;
    };
    air_date: string;
    air_weekday: number;
    images: {
      large: string;
      common: string;
      medium: string;
      small: string;
      grid: string;
    };
  }[];
}

export const runtime = 'nodejs';

/**
 * @swagger
 * /api/bangumi/calendar:
 *   get:
 *     summary: 获取番剧日历
 *     description: 获取指定星期几的番剧列表，不提供 weekday 参数时返回当天的番剧
 *     tags:
 *       - 番剧
 *     parameters:
 *       - in: query
 *         name: weekday
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 7
 *         description: 星期几（1-7，1为周一），不提供则返回当天
 *     responses:
 *       200:
 *         description: 返回番剧列表
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
 *                 code:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 list:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       title:
 *                         type: string
 *                       poster:
 *                         type: string
 *                       rate:
 *                         type: string
 *                       year:
 *                         type: string
 *       500:
 *         description: 获取数据失败
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
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  let weekday = searchParams.get('weekday');
  if (weekday === null) {
    // 获取当前时间是星期几
    weekday = (((new Date().getDay() + 6) % 7) + 1).toString();
  }

  const target = `https://api.bgm.tv/calendar`;
  try {
    // 调用豆瓣 API
    const calendarData = await fetchBangumiData<BangumiCalendarApiResponse[]>(
      target
    );

    // 转换数据格式
    let list: MovieItem[] = [];
    calendarData.forEach((item) => {
      if (item.weekday.id.toString() !== weekday) {
        return;
      }

      list = item.items.map((item) => ({
        id: item.id.toString(),
        title: item.name_cn,
        poster: item.images?.common || item.images?.large || '',
        rate: item.rating?.score ? item.rating.score.toFixed(1) : '',
        year: item.air_date?.match(/(\d{4})/)?.[1] || '',
      }));
    });

    const response: MovieResult = {
      code: 200,
      message: '获取成功',
      list: list,
    };

    const cacheTime = await getCacheTime();
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}, s-maxage=${cacheTime}`,
        'CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Vercel-CDN-Cache-Control': `public, s-maxage=${cacheTime}`,
        'Netlify-Vary': 'query',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: '获取Bangumi数据失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
