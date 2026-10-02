import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSeries, allSeriesIds, getShowsBySeries, toCardData } from '@/lib/data';
import { SOURCE_LABEL } from '@/lib/i18n';
import { LiveShowGroups } from '@/components/LiveShowGroups';
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
  // 非 ASCII id 先 decode：動態路由參數是 percent-encoded，直接查會
  // 查不到而整頁 notFound（詳見 app/show/[slug]/page.tsx 的註釋）
  const series = getSeries(decodeURIComponent(await params.then((p) => p.id)));
  if (!series) return {};
  const shows = getShowsBySeries(series.id);
  /*
   * 系列主视觉：getShowsBySeries 已按「上演中 → 即將開演 → 已結束、
   * 同状态最新在前」排好，取第一个有海报的作为分享图 ——
   * 没有任何海报的系列不出空图。
   */
  const poster = shows.find((show) => show.poster)?.poster ?? null;
  const title = `${series.name.zh}的舞台公演`;
  const description =
    `${series.original.zh}的 2.5 次元舞台劇、音樂劇公演一覽。${series.name.zh} / ${series.name.ja}の舞台化作品まとめ。`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images: poster ? [{ url: poster, alt: series.name.zh }] : undefined,
    },
    twitter: {
      card: poster ? 'summary_large_image' : 'summary',
      title,
      description,
      images: poster ? [poster] : undefined,
    },
  };
}

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  // 非 ASCII id 先 decode（詳見 app/show/[slug]/page.tsx 的註釋）
  const series = getSeries(decodeURIComponent(await params.then((p) => p.id)));
  if (!series) notFound();

  const shows = getShowsBySeries(series.id);

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

      {/* 分组在客户端按实时 JST 重算（归属/计数/网格同源），
          公演开演/落幕时不会再出现「计数还挂着、网格已空」的错位 */}
      <LiveShowGroups shows={shows.map(toCardData)} />

      {shows.length === 0 && (
        <p className="py-16 text-center text-fg-dim">
          <span className="i18n-zh">此系列目前沒有收錄中的公演</span>
          <span className="i18n-ja">このシリーズの公演はまだ収録されていません</span>
        </p>
      )}
    </article>
  );
}
