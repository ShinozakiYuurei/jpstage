import { getCalendarEntries } from '@/lib/data';
import { buildIcsCalendar } from '@/lib/ics';

export const dynamic = 'force-static';

/**
 * 全站公演日曆订阅源（/calendar.ics）
 *
 * ★ 静态导出：force-static 在 next build 时生成 out/calendar.ics，
 *   nginx 直接发文件 —— 与全站的「无服务端」形态一致。内容是构建时刻的
 *   全部上演中 + 即將開演档期；日历 App 定期拉取，重新部署后自动更新。
 *   只想订某个城市的用户用 /calendar/<城市>（见 app/calendar/[city]/route.ts）。
 */
export function GET(): Response {
  return new Response(buildIcsCalendar(getCalendarEntries(), '2.5次元舞台劇カレンダー'), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
}
