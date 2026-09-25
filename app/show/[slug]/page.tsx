import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getShow, allShowSlugs, getSeries, getVenue, getShowsBySeries, toCardData } from '@/lib/data';
import { hexToChannels } from '@/lib/color';
import { KIND_LABEL, SOURCE_LABEL, prefLabel, pick } from '@/lib/i18n';
import { formatDateWithWeekday, formatPeriod, formatPerformances, relativeDayLabel } from '@/lib/format';
import { PosterImage } from '@/components/PosterImage';
import { PosterArt } from '@/components/PosterArt';
import { ShowCard } from '@/components/ShowCard';
import { T } from '@/components/T';

/**
 * 公演详情页
 *
 * ★ 静态导出必须穷举所有 slug（generateStaticParams）：
 *   output: 'export' 下没有服务端兜底，漏一个 slug 就是构建期报错。
 *   这是好事 —— 它把「数据里有但页面没生成」这类问题挡在构建阶段，
 *   而不是留到线上变成 404。
 */
export function generateStaticParams() {
  return allShowSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const show = getShow(slug);
  if (!show) return {};
  const series = getSeries(show.seriesId);
  const title = pick(show.title, 'zh');
  return {
    title,
    description: `${show.title.zh}（${show.title.ja}）的日本公演資訊：期間 ${show.startDate} 〜 ${show.endDate}，共 ${show.runs.length} 個會場。${series ? `原作：${series.original.zh}` : ''}`,
    openGraph: {
      title,
      type: 'article',
    },
  };
}

export default async function ShowPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = getShow(slug);
  if (!show) notFound();

  const series = getSeries(show.seriesId);
  const totalPerformances = show.runs.reduce((n, r) => n + (r.performances ?? 0), 0);
  const hasPerformances = show.runs.some((r) => r.performances != null);
  /* 同系列的其他公演（排除自己）—— 这是 2.5 次元用户最可能想看的下一步 */
  const siblings = getShowsBySeries(show.seriesId).filter((s) => s.slug !== show.slug);

  /*
   * ★ data-page-nav 决定顶栏哪一项高亮（机制见 components/NavLinks.tsx）。
   *   值必须与 NavLinks 的 nav 标识一致：'now' | 'upcoming'。
   *   已结束的公演归到它原本属于的那一类没有意义（顶栏没有「已结束」项），
   *   所以 ended 时给 'now' 会误导 —— 这里给 'upcoming' 也不对。
   *   正确做法：已结束时**不写**这个属性，顶栏就不高亮任何一项，
   *   而面包屑仍然正常显示「已結束」。
   *   （用 undefined 让 React 直接不渲染该属性，而不是渲染成 data-page-nav="undefined"。）
   */
  const pageNav =
    show.status === 'now' ? 'now' : show.status === 'upcoming' ? 'upcoming' : undefined;

  return (
    <article
      {...(pageNav ? { 'data-page-nav': pageNav } : {})}
      /* 主色通道值：详情页头部的氛围色与卡片同源 */
      style={{ '--jp-accent-rgb': hexToChannels(show.accent) } as React.CSSProperties}
    >
      {/* 面包屑 */}
      <nav className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-dim">
        <Link href="/" className="transition hover:text-fg">
          <span className="i18n-zh">首頁</span>
          <span className="i18n-ja">ホーム</span>
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={show.status === 'upcoming' ? '/upcoming' : '/now'}
          className="transition hover:text-fg"
        >
          <span className="i18n-zh">
            {show.status === 'upcoming' ? '即將開演' : show.status === 'now' ? '上演中' : '公演'}
          </span>
          <span className="i18n-ja">
            {show.status === 'upcoming' ? '開幕予定' : show.status === 'now' ? '上演中' : '公演'}
          </span>
        </Link>
        {series && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/series/${series.id}`} className="transition hover:text-fg">
              <T t={series.name} />
            </Link>
          </>
        )}
        <span aria-hidden>/</span>
        <span className="text-fg-muted">
          <T t={show.title} />
        </span>
      </nav>

      {/* ── 头部：海报 + 资料 ──
       *
       * ★ 为什么这一块是 .jp-glass 而不是 .jp-panel：
       *   它承载 hover 无关的静态内容，但需要一个定位上下文来放主色层。
       *   .jp-glass 提供 position: relative + overflow: hidden，
       *   正是主色层（absolute inset-0）需要的。
       *   （用 .jp-panel 也行，但它没有 position —— 得自己加。）
       */}
      <header className="jp-glass relative overflow-hidden rounded-3xl p-4 sm:p-6">
        <div className="jp-accent-panel" aria-hidden />

        <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:gap-7">
          {/* 海报 */}
          <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-52">
            <div className="jp-poster relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-[var(--jp-poster-frame)]">
              {show.poster ? (
                <PosterImage
                  src={show.poster}
                  alt={pick(show.title, 'zh')}
                  /* 详情页海报是 LCP 元素，sizes 给足真实宽度即可 */
                  sizes="(max-width: 640px) 160px, 208px"
                  className="object-cover"
                  /* 详情页海报**必须** priority：它是这一页的 LCP 元素，
                     而用户在详情页的停留决策完全取决于这张图。 */
                  priority
                />
              ) : (
                <PosterArt title={show.title} accent={show.accent} />
              )}
            </div>
          </div>

          {/* 资料 */}
          <div className="min-w-0 flex-1">
            {/* 状态 + 类型 */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  show.status === 'now'
                    ? 'jp-status jp-status--now'
                    : show.status === 'upcoming'
                      ? 'jp-status jp-status--upcoming'
                      : 'jp-status'
                }
              >
                <span className="i18n-zh">
                  {show.status === 'now' ? '上演中' : show.status === 'upcoming' ? '即將開演' : '已結束'}
                </span>
                <span className="i18n-ja">
                  {show.status === 'now' ? '上演中' : show.status === 'upcoming' ? '開幕予定' : '終了'}
                </span>
              </span>
              <span className="jp-chip">
                <span className="i18n-zh">{KIND_LABEL[show.kind].zh}</span>
                <span className="i18n-ja">{KIND_LABEL[show.kind].ja}</span>
              </span>
              {series && (
                <span className="jp-chip">
                  <span className="i18n-zh">{SOURCE_LABEL[series.sourceKind].zh}原作</span>
                  <span className="i18n-ja">{SOURCE_LABEL[series.sourceKind].ja}原作</span>
                </span>
              )}
            </div>

            {/* 标题
             *
             * ★ 用 <h1> 且双语同层：SEO 上中文标题是主，日文原文同时存在
             *   对搜索引擎识别「这是同一部作品」有帮助（日文原名是官方名称，
             *   搜索量通常高于中文译名）。 */}
            <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-fg sm:text-3xl">
              <T t={show.title} />
            </h1>
            {show.subtitle && (
              <p className="mt-1 text-sm text-fg-soft">
                <T t={show.subtitle} />
              </p>
            )}

            {/* 开演倒数：只在待演时有意义 */}
            {show.status === 'upcoming' && (
              <p className="mt-2 text-sm font-semibold text-accent">
                <span className="i18n-zh">{relativeDayLabel(show.startDate, 'zh')}</span>
                <span className="i18n-ja">{relativeDayLabel(show.startDate, 'ja')}</span>
                <span className="text-fg-faint"> · </span>
                <span className="font-normal text-fg-soft">
                  <span className="i18n-zh">{formatDateWithWeekday(show.startDate, 'zh')} 開演</span>
                  <span className="i18n-ja">{formatDateWithWeekday(show.startDate, 'ja')} 開幕</span>
                </span>
              </p>
            )}

            {/* 资料表 */}
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Row labelZh="公演期間" labelJa="公演期間">
                <span className="tabular-nums">
                  {/* 中日同形（都用汉字年/月/日），无需双语渲染 */}
                  {formatPeriod(show.startDate, show.endDate)}
                </span>
              </Row>
              <Row labelZh="會場數" labelJa="会場数">
                {show.runs.length}
                <span className="i18n-zh"> 個會場</span>
                <span className="i18n-ja"> 会場</span>
              </Row>
              {hasPerformances && (
                <Row labelZh="總場次" labelJa="総公演数">
                  <span className="i18n-zh">{formatPerformances(totalPerformances, 'zh')}</span>
                  <span className="i18n-ja">{formatPerformances(totalPerformances, 'ja')}</span>
                </Row>
              )}
              {series && (
                <Row labelZh="原作" labelJa="原作">
                  <T t={series.original} />
                </Row>
              )}
              <Row labelZh="製作" labelJa="製作">
                {show.company}
              </Row>
            </dl>

            {/* 官方链接
             *
             * ★ 为什么必须有 rel="noopener noreferrer"：
             *   target="_blank" 打开的新页面能通过 window.opener 反向操作
             *   本页（钓鱼攻击的常见手法）。noopener 切断这个引用。
             *   noreferrer 则是顺带不把 referrer 传给外站 ——
             *   对本站这种聚合站，不泄露用户来源是合适的默认。 */}
            {(show.officialUrl || show.ticketUrl) && (
              <div className="mt-5 flex flex-wrap gap-2">
                {show.officialUrl && (
                  <a
                    href={show.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jp-btn-primary rounded-full px-4 py-2 text-xs font-semibold"
                  >
                    <span className="i18n-zh">官方網站</span>
                    <span className="i18n-ja">公式サイト</span>
                    <span aria-hidden className="ml-1">
                      ↗
                    </span>
                  </a>
                )}
                {show.ticketUrl && (
                  <a
                    href={show.ticketUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jp-btn-ghost rounded-full px-4 py-2 text-xs font-semibold"
                  >
                    <span className="i18n-zh">購票資訊</span>
                    <span className="i18n-ja">チケット</span>
                    <span aria-hidden className="ml-1">
                      ↗
                    </span>
                  </a>
                )}
              </div>
            )}

            {/* 购票提示：本站不售票，必须说清楚 */}
            <p className="mt-3 text-[11px] leading-relaxed text-fg-dim">
              <span className="i18n-zh">
                本站不提供售票服務，亦不保證場次與售票狀況。請以官方網站公布為準。
              </span>
              <span className="i18n-ja">
                本サイトはチケット販売を行いません。日程・販売状況は必ず公式サイトでご確認ください。
              </span>
            </p>
          </div>
        </div>
      </header>

      {/* ── 公演日程（各會場） ── */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-baseline gap-3 border-b border-hairline pb-2.5 text-lg font-semibold tracking-tight text-fg">
          <span className="i18n-zh">公演日程</span>
          <span className="i18n-ja">公演スケジュール</span>
          <span className="ml-auto text-xs font-normal text-fg-dim">
            {show.runs.length}
            <span className="i18n-zh"> 個會場</span>
            <span className="i18n-ja"> 会場</span>
          </span>
        </h2>

        <ul className="space-y-2.5">
          {show.runs.map((run) => {
            const venue = getVenue(run.venueId);
            if (!venue) return null;
            return (
              <li key={`${run.venueId}-${run.startDate}`}>
                <div className="jp-panel flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-fg">
                      <Link
                        href={`/venue/${venue.id}`}
                        className="transition hover:text-accent"
                      >
                        <T t={venue.name} />
                      </Link>
                    </p>
                    <p className="mt-0.5 text-xs text-fg-dim">
                      <span className="i18n-zh">{prefLabel(venue.pref, 'zh')}</span>
                      <span className="i18n-ja">{prefLabel(venue.pref, 'ja')}</span>
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
                  </div>
                  <p className="shrink-0 text-xs font-medium tabular-nums text-fg-soft">
                    {/* 中日同形，无需双语渲染 */}
                    {formatPeriod(run.startDate, run.endDate)}
                  </p>
                  {run.performances != null && (
                    <p className="shrink-0 text-xs text-fg-dim">
                      <span className="i18n-zh">{formatPerformances(run.performances, 'zh')}</span>
                      <span className="i18n-ja">{formatPerformances(run.performances, 'ja')}</span>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── 出演者 ── */}
      {show.cast.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 border-b border-hairline pb-2.5 text-lg font-semibold tracking-tight text-fg">
            <span className="i18n-zh">出演</span>
            <span className="i18n-ja">出演</span>
          </h2>
          <ul className="flex flex-wrap gap-2">
            {show.cast.map((name) => (
              <li key={name} className="jp-chip">
                {name}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── 工作人員 ── */}
      {show.staff.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 border-b border-hairline pb-2.5 text-lg font-semibold tracking-tight text-fg">
            <span className="i18n-zh">工作人員</span>
            <span className="i18n-ja">スタッフ</span>
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {show.staff.map((st) => (
              <div key={`${st.role.zh}-${st.name}`} className="flex gap-3">
                <dt className="w-24 shrink-0 text-fg-dim">
                  <T t={st.role} />
                </dt>
                <dd className="min-w-0 text-fg-soft">{st.name}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ── 作品介紹 ── */}
      <section className="mt-8">
        <h2 className="mb-3 border-b border-hairline pb-2.5 text-lg font-semibold tracking-tight text-fg">
          <span className="i18n-zh">作品介紹</span>
          <span className="i18n-ja">作品紹介</span>
        </h2>
        {/*
         * ★ 为什么把 \n 切成 <p> 而不是用 white-space: pre-line：
         *   pre-line 会保留源码里的缩进与换行 —— JSX 里为了可读性
         *   写的缩进也会被渲染出来，段落左边缘参差不齐。
         *   按 \n 切分再各自包 <p>，段落间距由 CSS 控制，观感稳定。
         *
         * ★ 双语的两段简介是**独立的两块**（各自切分），
         *   而不是「一个容器装两种语言」—— 因为中日的段落数可能不同
         *   （翻译时多一段少一段很常见），共用一个容器会导致
         *   「中文三段的排版规则套在日文两段上」。分开各自处理最稳。
         */}
        <div className="jp-prose text-sm text-[var(--jp-summary-fg)]">
          <div className="i18n-zh">
            {show.summary.zh.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <div className="i18n-ja">
            {show.summary.ja.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      </section>

      {/* ── 同系列其他公演 ── */}
      {siblings.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 flex items-baseline gap-3 border-b border-hairline pb-2.5 text-lg font-semibold tracking-tight text-fg">
            <span className="i18n-zh">同系列公演</span>
            <span className="i18n-ja">同じシリーズの公演</span>
            {series && (
              <Link
                href={`/series/${series.id}`}
                className="ml-auto text-xs font-normal text-fg-dim transition hover:text-fg"
              >
                <span className="i18n-zh">查看全部 →</span>
                <span className="i18n-ja">すべて見る →</span>
              </Link>
            )}
          </h2>
          <div className="jp-stagger grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {siblings.map((s, i) => (
              <div key={s.slug} style={{ '--i': i } as React.CSSProperties} className="h-full">
                {/* 这里是页面下方，不需要 priority —— 首屏的 LCP 已经由页头海报承担 */}
                <ShowCard show={toCardData(s)} />
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

/** 资料表的一行：左标签 + 右值 */
function Row({
  labelZh,
  labelJa,
  children,
}: {
  labelZh: string;
  labelJa: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-fg-dim">
        <span className="i18n-zh">{labelZh}</span>
        <span className="i18n-ja">{labelJa}</span>
      </dt>
      <dd className="min-w-0 flex-1 text-fg-soft">{children}</dd>
    </div>
  );
}
