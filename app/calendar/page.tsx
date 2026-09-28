import type { Metadata } from 'next';
import { getCalendarEntries, getTodayJst } from '@/lib/data';
import { ShowCalendar } from '@/components/ShowCalendar';

export const metadata: Metadata = {
  title: '公演日曆',
  description: '依日期瀏覽日本 2.5 次元舞台劇與音樂劇，並可將各場次加入個人行事曆。依日期與城市尋找有演出的公演。',
};

export default function CalendarPage() {
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
      <ShowCalendar entries={getCalendarEntries()} today={getTodayJst()} />
    </div>
  );
}
