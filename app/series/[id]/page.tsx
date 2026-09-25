import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSeries, allSeriesIds, getShowsBySeries, toCardData } from '@/lib/data';
import { SOURCE_LABEL } from '@/lib/i18n';
import { formatPeriod } from '@/lib/format';
import { ShowCard } from '@/components/ShowCard';
import { T } from '@/components/T';

/**
 * 系列详情页
 *
 * ★ 分组为什么是「上演中 / 即將開演 / 已結束」而不是「按年份」：
 *   用户进入某个系列页的意图几乎总是「现在有什么能看」，
 *   而不是「这个系列的历史」。所以把「能看的」放在最前面，
 *   已结束的沉在最后（但**不隐藏** —— 它是这个系列的完整记录，
 *   而且用户可能想确认「上一部是什么时候演的」）。
 */
export function generateStaticParams() {
  return allSeriesIds().map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const series = getSeries(id);
  if (!series) return {};
  return {
    title: `${series.name.zh}的舞台公演`,
    description: `${series.original.zh}的 2.5 次元舞台劇、音樂劇公演一覽。${series.name.zh} / ${series.name.ja}の舞台化作品まとめ。`,
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const series = getSeries(id);
  if (!series) notFound();

  const shows = getShowsBySeries(series.id);
  const groups = [
    {
      key: 'now',
      zh: '上演中',
      ja: '上演中',
      items: shows.filter((s) => s.status === 'now'),
    },
    {
      key: 'upcoming',
      zh: '即將開演',
      ja: '開幕予定',
      items: shows.filter((s) => s.status === 'upcoming'),
    },
    {
      key: 'ended',
      zh: '已結束',
      ja: '終了',
      items: shows.filter((s) => s.status === 'ended'),
    },
  ].filter((g) => g.items.length > 0);

  return (
    /* data-page-nav='series'：让顶栏「系列」高亮 */
    <article data-page-nav="series">
      {/* 面包屑 */}
      <nav className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-dim">
        <Link href="/" className="transition hover:text-fg">
          <span className="i18n-zh">首頁</span>
          <span className="i18n-ja">ホーム</span>
        </Link>
        <span aria-hidden>/</span>
        <Link href="/series" className="transition hover:text-fg">
          <span className="i18n-zh">系列</span>
          <span className="i18n-ja">シリーズ</span>
        </Link>
        <span aria-hidden>/</span>
        <span className="text-fg-muted">
          <T t={series.name} />
        </span>
      </nav>

      <header className="jp-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-fg">
            <T t={series.name} />
          </h1>
          <span className="jp-chip shrink-0">
            <span className="i18n-zh">{SOURCE_LABEL[series.sourceKind].zh}原作</span>
            <span className="i18n-ja">{SOURCE_LABEL[series.sourceKind].ja}原作</span>
          </span>
        </div>
        <p className="mt-2 text-sm text-fg-soft">
          <T t={series.original} />
        </p>
        <p className="mt-3 text-xs text-fg-dim">
          <span className="i18n-zh">本站收錄此系列的 {shows.length} 部舞台公演。</span>
          <span className="i18n-ja">このシリーズの舞台公演を {shows.length} 件収録しています。</span>
        </p>
      </header>

      {groups.map((g) => (
        <section key={g.key} className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-2.5">
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              <span className="i18n-zh">{g.zh}</span>
              <span className="i18n-ja">{g.ja}</span>
            </h2>
            <span className="ml-auto text-xs text-fg-dim">
              {g.items.length}
              <span className="i18n-zh"> 部</span>
              <span className="i18n-ja"> 件</span>
            </span>
          </div>

          <div className="jp-stagger grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {g.items.map((s, i) => (
              <div key={s.slug} style={{ '--i': i } as React.CSSProperties} className="h-full">
                <ShowCard show={toCardData(s)} />
              </div>
            ))}
          </div>

          {/* 已结束的分组附上期间一览：用户常需要确认「上一部演到什么时候」 */}
          {g.key === 'ended' && (
            <ul className="mt-3 space-y-1 text-xs text-fg-dim">
              {g.items.map((s) => (
                <li key={s.slug} className="flex flex-wrap gap-x-2">
                  <span className="text-fg-soft">
                    <T t={s.title} />
                  </span>
                  <span className="tabular-nums">
                    {/* 中日同形，一次渲染即可 */}
                    {formatPeriod(s.startDate, s.endDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {shows.length === 0 && (
        <p className="py-16 text-center text-fg-dim">
          <span className="i18n-zh">此系列目前沒有收錄中的公演</span>
          <span className="i18n-ja">このシリーズの公演はまだ収録されていません</span>
        </p>
      )}
    </article>
  );
}
