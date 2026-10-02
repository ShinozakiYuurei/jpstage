import type { Metadata } from 'next';
import { getCalendarEntries, getTodayJst } from '@/lib/data';
import { cityLabel } from '@/lib/i18n';
import { ShowCalendar } from '@/components/ShowCalendar';

export const metadata: Metadata = {
  title: '公演日曆',
  description: '依日期瀏覽日本 2.5 次元舞台劇與音樂劇，並可將各場次加入個人行事曆。依日期與城市尋找有演出的公演。',
};

export default function CalendarPage() {
  /* 有档期的城市才给订阅入口（与 app/calendar/[city]/route.ts 的穷举一致） */
  const cities = [
    ...new Set(getCalendarEntries().map((entry) => entry.city).filter(Boolean)),
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <section className="mb-6">
        <p className="mb-2 text-xs font-semibold tracking-[0.18em] text-accent uppercase">Show Calendar</p>
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">
          <span className="i18n-zh">演出<span className="jp-grad-text">日曆</span></span>
          <span className="i18n-ja">公演<span className="jp-grad-text">カレンダー</span></span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-fg-muted">
          <span className="i18n-zh">按日期查看各城市有演出的舞台劇，並依劇目分組檢視場次；點選「加入日曆」可下載檔期並匯入常用日曆。</span>
          <span className="i18n-ja">日付と都市で公演を絞り込み、同じ作品の公演をまとめて確認できます。「カレンダーに追加」から予定をダウンロードして、お使いのカレンダーに登録できます。</span>
        </p>
      </section>
      <section className="jp-panel mb-6 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg">
              <span className="i18n-zh">訂閱整份日曆</span>
              <span className="i18n-ja">カレンダーを購読</span>
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-fg-muted">
              <span className="i18n-zh">把 /calendar.ics 加入 Google 日曆（其他日曆 → 從網址新增）或 Apple / Outlook 的訂閱日曆；新公演發布後會自動同步，不用手動匯入。</span>
              <span className="i18n-ja">/calendar.ics を Googleカレンダー（「URLで追加」）やApple / Outlookの購読カレンダーに追加すると、新しい公演が自動で反映されます。</span>
            </p>
          </div>
          <a href="/calendar.ics" className="jp-btn-primary shrink-0 rounded-full px-4 py-2 text-xs font-semibold">
            <span className="i18n-zh">取得 .ics</span>
            <span className="i18n-ja">.ics を取得</span>
          </a>
        </div>
        <div className="mt-3 border-t border-hairline pt-3">
          <p className="text-xs text-fg-dim">
            <span className="i18n-zh">只想訂某個城市：</span>
            <span className="i18n-ja">都市ごとに購読：</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cities.map((city) => (
              <a
                key={city}
                /* 路由 handler 產物是「檔案」而非目錄 —— 帶尾斜杠會被
                   nginx 當目錄找而 404（/calendar.ics 同理），不能帶斜杠。 */
                href={'/calendar/' + encodeURIComponent(city)}
                className="jp-chip text-xs transition hover:border-accent/50 hover:text-fg"
              >
                <span className="i18n-zh">{cityLabel(city, 'zh')}</span>
                <span className="i18n-ja">{city}</span>
              </a>
            ))}
          </div>
        </div>
      </section>
      <ShowCalendar entries={getCalendarEntries()} today={getTodayJst()} />
    </div>
  );
}
