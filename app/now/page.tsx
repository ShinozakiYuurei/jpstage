import type { Metadata } from 'next';
import { allShowSpans, getShowBriefs, getMeta } from '@/lib/data';
import { ShowExplorer } from '@/components/ShowExplorer';
import { LiveCount } from '@/components/LiveCounts';

export const metadata: Metadata = {
  title: '上演中的公演',
  description:
    '日本 2.5 次元舞台劇、音樂劇現正上演中的公演一覽。可按類型、城市、原作媒體篩選，並依開演日或規模排序。上演中の2.5次元舞台・ミュージカル公演一覧。',
};

/**
 * 上演中的公演（全部，不分页）
 *
 * ★ 为什么单独一页而不是在首页截断：
 *   首页为压首屏只渲染 8 组，但长尾里有一批「单档只演几场」的公演
 *   （巡演末站、地方会場），它们按规模排序会沉到很后面。
 *   用户从首页看不到，会以为「这部没收录」。
 *   本页渲染全部（静态导出，nginx 直接发文件，不影响首页首屏）。
 *
 * ★ 为什么 initialStatus 固定为 ['now']：
 *   这一页的语义就是「上演中」，用户进来不该再看到已结束的公演。
 *   但筛选器仍然可用（可以再叠城市/类型），只是状态维度默认已选。
 *   同时 hideStatusFilter —— 在「上演中」页里再给一个状态筛选器，
 *   用户取消勾选后会看到一堆已结束的条目，与页面标题矛盾。
 *   （想跨状态浏览的用户有首页的完整清单与 /upcoming。）
 */
export default function NowPage() {
  const briefs = getShowBriefs();
  const meta = getMeta();
  const spans = allShowSpans();

  return (
    <>
      <section className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="i18n-zh">
            上演<span className="jp-grad-text">中</span>
          </span>
          <span className="i18n-ja">
            上演<span className="jp-grad-text">中</span>
          </span>
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          {/* 计数挂载后按实时 JST 重算（LiveCounts），不会把已落幕的公演数进去 */}
          <span className="i18n-zh">
            共 <LiveCount spans={spans} status="now" fallback={meta.counts.now} /> 部公演正在日本各地上演，按規模排列。
            可依類型、城市、原作媒體進一步篩選。
          </span>
          <span className="i18n-ja">
            日本各地で上演中の公演が <LiveCount spans={spans} status="now" fallback={meta.counts.now} /> 件。規模順に並んでいます。
            種別・都市・原作メディアで絞り込めます。
          </span>
        </p>
      </section>

      <ShowExplorer
        briefs={briefs}
        initialStatus={['now']}
        initialSort="start"
        searchPlaceholder={{ zh: '搜尋作品名、出演者、會場…', ja: '作品名・出演者・会場で検索…' }}
        hideStatusFilter
      />
    </>
  );
}
