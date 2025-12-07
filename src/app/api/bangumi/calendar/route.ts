import { NextResponse } from 'next/server';

import { fetchBangumiData } from '@/lib/bangumi';
import { getCacheTime } from '@/lib/config';
import { MovieResult, MovieItem } from '@/lib/types';

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
