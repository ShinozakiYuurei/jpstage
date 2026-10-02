import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getVenue, allVenueIds, getShowsByVenue, getRunsByVenue, toCardData } from '@/lib/data';
import { prefLabel, pick } from '@/lib/i18n';
import { formatPeriod } from '@/lib/format';
import { LiveShowGrid } from '@/components/LiveShowGrid';
import { T } from '@/components/T';

/**
 * 会場详情页
 *
 * ★ 这一页回答的问题：「我下个月去東京，这个会場那时候有什么？」
 *   所以核心内容是**该会場的档期表**（按时间排列的各公演期间），
 *   而不是公演卡片墙 —— 卡片墙会让用户看不出「哪几档是重叠的」。
 *   两者都给：档期表在上（一眼看清时间分布），卡片墙在下（点进详情）。
 */
export function generateStaticParams() {
  return allVenueIds().map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const venue = getVenue(id);
  if (!venue) return {};
  return {
    title: `${venue.name.zh}的公演日程`,
    description: `${pick(venue.name, 'zh')}（${pick(venue.name, 'ja')}）的 2.5 次元舞台劇、音樂劇公演日程一覽。${prefLabel(venue.pref, 'zh')}${venue.address}。`,
  };
}

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const venue = getVenue(id);
  if (!venue) notFound();

  const shows = getShowsByVenue(venue.id);
  const nowCount = shows.filter((s) => s.status === 'now').length;
  /* 档期表：按各档开始日排序（同一会場可能有同一公演的多档） */
  const runs = getRunsByVenue(venue.id).sort((a, b) =>
    a.run.startDate.localeCompare(b.run.startDate),
  );

  return (
    /* data-page-nav='venue'：让顶栏「會場」高亮（机制见 components/NavLinks.tsx） */
    <article data-page-nav="venue">
      {/* 面包屑 */}
      <nav className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-dim">
        <Link href="/" className="transition hover:text-fg">
          <span className="i18n-zh">首頁</span>
          <span className="i18n-ja">ホーム</span>
        </Link>
        <span aria-hidden>/</span>
        <Link href="/venue" className="transition hover:text-fg">
          <span className="i18n-zh">會場</span>
          <span className="i18n-ja">会場</span>
        </Link>
        <span aria-hidden>/</span>
        <span className="text-fg-muted">
          <T t={venue.name} />
        </span>
      </nav>

      <header className="jp-panel rounded-2xl p-5">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-fg">
          <T t={venue.name} />
        </h1>
        <p className="mt-2 text-sm text-fg-soft">
          <span className="i18n-zh">{prefLabel(venue.pref, 'zh')}</span>
          <span className="i18n-ja">{prefLabel(venue.pref, 'ja')}</span>
          <span className="text-fg-faint"> · </span>
          {venue.address}
          {venue.seats != null && (
            <>
              <span className="text-fg-faint"> · </span>
              <span className="tabular-nums">
                {venue.seats}
                <span className="i18n-zh"> 席</span>
                <span className="i18n-ja"> 席</span>
              </span>
            </>
          )}
        </p>
        <p className="mt-3 text-xs text-fg-dim">
          <span className="i18n-zh">
            本站收錄此會場的 {shows.length} 部公演
            {nowCount > 0 && `，其中 ${nowCount} 部正在上演`}。
          </span>
          <span className="i18n-ja">
            当会場の公演は {shows.length} 件
            {nowCount > 0 && `（うち上演中 ${nowCount} 件）`}。
          </span>
        </p>
      </header>

      {/* ── 档期表 ── */}
      {runs.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 border-b border-hairline pb-2.5 text-lg font-semibold tracking-tight text-fg">
            <span className="i18n-zh">檔期</span>
            <span className="i18n-ja">スケジュール</span>
          </h2>
          {/*
           * ★ 为什么用「时间轴」形态而不是表格：
           *   同一会場的档期常有重叠（大劇場有多个厅，或前后档紧接），
           *   表格看不出重叠，而左侧一条竖线 + 日期块能一眼看出
           *   「哪几档是同时的、哪几档是接续的」。
           */}
          <ol className="relative space-y-2.5 pl-5">
            {/* 时间轴竖线：绝对定位，不占布局宽度 */}
            <span
              aria-hidden
              className="absolute bottom-2 left-[5px] top-2 w-px"
              style={{ background: 'var(--jp-hairline-strong)' }}
            />
            {runs.map(({ show, run }) => (
              <li key={`${show.slug}-${run.startDate}`} className="relative">
                {/* 时间轴节点 */}
                <span
                  aria-hidden
                  className="absolute -left-5 top-3.5 h-2.5 w-2.5 rounded-full border-2"
                  style={{
                    borderColor:
                      show.status === 'now'
                        ? 'var(--jp-st-now-dot)'
                        : show.status === 'upcoming'
                          ? 'var(--jp-st-soon-dot)'
                          : 'var(--jp-st-end-dot)',
                    background: 'var(--jp-canvas)',
                  }}
                />
                <Link
                  href={`/show/${show.slug}`}
                  className="jp-glass flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-snug text-fg">
                      <T t={show.title} />
                    </p>
                    <p className="mt-0.5 text-xs text-fg-dim">
                      {/* 中日同形，无需双语渲染 */}
                      {formatPeriod(run.startDate, run.endDate)}
                    </p>
                  </div>
                  {run.performances != null && (
                    <span className="shrink-0 text-xs tabular-nums text-fg-soft">
                      {run.performances}
                      <span className="i18n-zh"> 場</span>
                      <span className="i18n-ja"> 公演</span>
                    </span>                  )}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── 公演卡片墙 ── */}
      {shows.length > 0 && (
        <section className="mt-9">
          <h2 className="mb-3 border-b border-hairline pb-2.5 text-lg font-semibold tracking-tight text-fg">
            <span className="i18n-zh">在此會場上演的公演</span>
            <span className="i18n-ja">この会場の公演</span>
          </h2>
          {/* 卡片状态交给 LiveShowGrid 客户端实时重算（mode='all'：不过滤，只让状态徽章跟上现实） */}
          <LiveShowGrid shows={shows.map(toCardData)} mode="all" />
        </section>
      )}

      {shows.length === 0 && (
        <p className="py-16 text-center text-fg-dim">
          <span className="i18n-zh">此會場目前沒有收錄中的公演</span>
          <span className="i18n-ja">この会場の公演はまだ収録されていません</span>
        </p>
      )}
    </article>
  );
}
