import { getCalendarEntries } from '@/lib/data';
import { cityLabel } from '@/lib/i18n';
import { buildIcsCalendar } from '@/lib/ics';

export const dynamic = 'force-static';

/**
 * 按城市拆分的订阅源（/calendar/<城市>）
 *
 * ★ 为什么按城市拆：跨城市跑动的观众只想订「东京 + 大阪」两站，
 *   全站源会把不相关城市的档期也灌进来。城市集合从日历数据本身
 *   穷举（generateStaticParams），有公演的城市才生成文件 ——
 *   城市清零的订阅地址随部署自然消失，不会留下空日历。
 *
 * ★ 静态导出注意：動態參數是 percent-encoded（與 show/series 詳情頁
 *   同一個坑），GET 里必須先 decode 再比對。
 */
export function generateStaticParams() {
  const cities = [
    ...new Set(getCalendarEntries().map((entry) => entry.city).filter(Boolean)),
  ];
  return cities.map((city) => ({ city }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ city: string }> },
) {
  const city = decodeURIComponent((await params).city);
  const entries = getCalendarEntries().filter((entry) => entry.city === city);
  if (!entries.length) return new Response('not found', { status: 404 });
  const calname = '2.5次元舞台劇カレンダー（' + cityLabel(city, 'ja') + '）';
  return new Response(buildIcsCalendar(entries, calname), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
}
