import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllSeries, getShowsBySeries, getAllShows } from '@/lib/data';
import { SOURCE_LABEL } from '@/lib/i18n';
import { T } from '@/components/T';

export const metadata: Metadata = {
  title: '系列作品一覽',
  description:
    '日本 2.5 次元舞台劇、音樂劇的原作系列一覽。含原作媒體（漫畫 / 動畫 / 遊戲 / 小說）與各系列的公演件數。2.5次元舞台の原作シリーズ一覧。',
};

/**
 * 系列一覧
 *
 * ★ 为什么这是本站的核心入口之一：
 *   2.5 次元观众的检索方式与电影观众不同 —— 电影按「最近上映什么」，
 *   而 2.5 次元按「我追的那部作品最近有什么舞台化」。
 *   系列是这个意图的直接对应物，所以它既是导航项也是首页区块。
 *
 * ★ 为什么按公演数降序而不是五十音/拼音：
 *   热门系列（刀劍亂舞、排球少年）公演最多，用户最可能找它们。
 *   五十音顺序对中文用户更是完全无意义（他们不认日文假名顺序）。
 *   按件数排等于「热度排序」，这是唯一对双语用户都成立的顺序。
 */
export default function SeriesListPage() {
  const series = getAllSeries();
  const allShows = getAllShows();

  const items = series
    .map((s) => {
      const shows = getShowsBySeries(s.id);
      return {
        s,
        total: shows.length,
        now: shows.filter((x) => x.status === 'now').length,
        upcoming: shows.filter((x) => x.status === 'upcoming').length,
      };
    })
    .sort((a, b) => b.total - a.total || a.s.name.zh.localeCompare(b.s.name.zh, 'zh-Hant'));

  return (
    <>
      <section className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="i18n-zh">
            系列<span className="jp-grad-text">作品</span>
          </span>
          <span className="i18n-ja">
            原作<span className="jp-grad-text">シリーズ</span>
          </span>
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          <span className="i18n-zh">
            共 {series.length} 個系列、{allShows.length} 部公演。按公演數量排列。
          </span>
          <span className="i18n-ja">
            全 {series.length} シリーズ、{allShows.length} 公演。公演数の多い順。
          </span>
        </p>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ s, total, now, upcoming }) => (
          <Link
            key={s.id}
            href={`/series/${s.id}`}
            className="jp-glass flex flex-col gap-2 rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-bold leading-snug tracking-tight text-fg">
                <T t={s.name} />
              </h2>
              <span className="jp-chip shrink-0">
                <span className="i18n-zh">{SOURCE_LABEL[s.sourceKind].zh}</span>
                <span className="i18n-ja">{SOURCE_LABEL[s.sourceKind].ja}</span>
              </span>
            </div>

            {/* 原作作品名：区分「同名不同媒体」的关键（例如「漫畫《排球少年!!》」） */}
            <p className="line-clamp-2 text-xs leading-relaxed text-fg-dim">
              <T t={s.original} />
            </p>

            <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-1 text-xs font-medium text-fg-soft">
              <span>
                {total}
                <span className="i18n-zh"> 部公演</span>
                <span className="i18n-ja"> 公演</span>
              </span>
              {now > 0 && (
                <>
                  <span className="text-fg-faint">·</span>
                  <span style={{ color: 'var(--jp-st-now-fg)' }}>
                    {now}
                    <span className="i18n-zh"> 上演中</span>
                    <span className="i18n-ja"> 上演中</span>
                  </span>
                </>
              )}
              {upcoming > 0 && (
                <>
                  <span className="text-fg-faint">·</span>
                  <span style={{ color: 'var(--jp-st-soon-fg)' }}>
                    {upcoming}
                    <span className="i18n-zh"> 即將開演</span>
                    <span className="i18n-ja"> 開幕予定</span>
                  </span>
                </>
              )}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
