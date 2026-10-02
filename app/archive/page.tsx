import type { Metadata } from 'next';
import { getShowBriefs } from '@/lib/data';
import { ShowExplorer } from '@/components/ShowExplorer';

export const metadata: Metadata = {
  title: '公演檔案庫',
  description:
    '已結束的日本 2.5 次元舞台劇、音樂劇公演完整檔案，可按關鍵字、類型、城市檢索。終了した2.5次元舞台・ミュージカル公演のアーカイブ。',
};

/**
 * 公演檔案庫（已結束）
 *
 * ★ 为什么单独一页而不与上演中混排：上演中/即將開演回答
 *   「现在能看什么」，已結束回答「以前演过什么」—— 两种意图
 *   排在同一条时间线上会互相淹没（完结长尾把在演的顶到看不见）。
 *   档案库默认按結束日新→旧排列，搜索/筛选与列表页同一套；
 *   保留已結束資料的 SEO 价值不变（詳情頁依舊存在）。
 */
export default function ArchivePage() {
  /* status 構建期定稿；客戶端掛載後 ShowExplorer 會按當前 JST 重算，
     剛落幕的公演自然留在這裡，不會跑到 /now 去。 */
  const briefs = getShowBriefs().filter((brief) => brief.status === 'ended');

  return (
    <>
      <section className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="i18n-zh">
            公演<span className="jp-grad-text">檔案庫</span>
          </span>
          <span className="i18n-ja">
            公演<span className="jp-grad-text">アーカイブ</span>
          </span>
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          <span className="i18n-zh">
            已結束的 {briefs.length} 部公演，按結束日由新到舊排列；可搜尋，可依類型、城市等篩選。
          </span>
          <span className="i18n-ja">
            終了した {briefs.length} 公演を終了日が新しい順に。検索と絞り込みができます。
          </span>
        </p>
      </section>
      <ShowExplorer
        briefs={briefs}
        initialStatus={['ended']}
        initialSort="end"
        hideStatusFilter
        searchPlaceholder={{ zh: '搜尋已結束的作品、出演者、會場…', ja: '終了した作品・出演者・会場で検索…' }}
      />
    </>
  );
}
