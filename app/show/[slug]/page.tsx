import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getShow, allShowSlugs, getSeries, getVenue, getShowsBySeries, toCardData } from '@/lib/data';
import { hexToChannels } from '@/lib/color';
import { KIND_LABEL, SOURCE_LABEL, VENDOR_LABEL, prefLabel, pick } from '@/lib/i18n';
import { PAYMENT_LABEL, paymentMethodsOf, type PaymentMethod } from '@/lib/ticket-payments';
import { formatDateWithWeekday, formatPeriod, formatPerformances, relativeDayLabel } from '@/lib/format';
import { PosterImage } from '@/components/PosterImage';
import { PosterArt } from '@/components/PosterArt';
import { LiveShowGrid } from '@/components/LiveShowGrid';
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
  /* 简介是否真的有内容（源站大量条目没登记简介，见下方 section 的注释） */
  const hasSummary = Boolean(show.summary?.zh?.trim() || show.summary?.ja?.trim());

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
              {series && (series.original.zh || series.original.ja) && (
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
            {(show.officialUrl || show.ticketChannels.length > 0) && (
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
                {/*
                 * 售票平台
                 *
                 * ★ 为什么逐个平台给链接、而不是合并成一个「购票资讯」：
                 *   同一部作品常常同时在三家卖（实测某作品有 lawson / pia /
                 *   eplus 三个专属页），合并就等于替用户随机挑一家 ——
                 *   而观众手上往往只有某家的账号。
                 *
                 * ★ 为什么渠道名只显示一种语言：
                 *   这是**链接的标签**，用户认出的是平台品牌本身
                 *   （两边写「イープラス」），所以与筛选项不同 ——
                 *   筛选项要并排比较才写两种，标签只需认得出。
                 *
                 * ★ 为什么有平台但没有链接时不给链接：
                 *   那表示源站只登记了「在哪儿买」、没给这部作品的页面。
                 *   编一个平台首页链接出去等于骗用户（点进去找不到这部戏），
                 *   所以渲染成纯标签，让它只承担「告诉你有这家」的作用。
                 */}
                {show.ticketChannels.map((ch) => {
                  const label = VENDOR_LABEL[ch.vendor];
                  return ch.url ? (
                    <a
                      key={ch.vendor}
                      href={ch.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="jp-btn-ghost rounded-full px-3 py-1.5 text-xs font-semibold"
                    >
                      <span className="i18n-zh">{label.zh}</span>
                      <span className="i18n-ja">{label.ja}</span>
                      <span aria-hidden className="ml-1">
                        ↗
                      </span>
                    </a>
                  ) : (
                    <span
                      key={ch.vendor}
                      className="rounded-full border border-hairline px-3 py-1.5 text-xs text-fg-soft"
                    >
                      <span className="i18n-zh">{label.zh}</span>
                      <span className="i18n-ja">{label.ja}</span>
                    </span>
                  );
                })}
              </div>
            )}

            {/*
             * 支付方式
             *
             * ★ 为什么放在售票平台下面而不是做成一个独立区块：
             *   用户看完「在哪买」的下一个问题就是「我的卡能不能用」——
             *   两件事贴在一起看，不必来回滚动。
             *
             * ★ 为什么只在已核实时列具体方式：
             *   未核实的平台写「待確認」而不是留空 ——
             *   留空会被读成「这家不收卡」，而实际是「本站还没查到」。
             *   显示错的比不显示更糟，显示「不知道」是诚实的。
             *
             * ★ 为什么按平台分行而不是汇总去重：
             *   支付方式是**平台的**政策。把三家平台的卡种汇总成一串，
             *   用户拿着 Visa 去 ローソン 买不到时，会以为是本站骗人 ——
             *   而真相是另一家才收。分行呈现才对应真实世界的规则。
             */}
            {show.ticketChannels.length > 0 && (
              <div className="mt-4 rounded-xl border border-hairline p-3">
                <p className="text-xs font-semibold text-fg-soft">
                  <span className="i18n-zh">各平台可用的支付方式</span>
                  <span className="i18n-ja">チケットサイトごとの支払方法</span>
                </p>
                <ul className="mt-2 space-y-1.5">
                  {show.ticketChannels.map((ch) => {
                    const info = paymentMethodsOf(ch.vendor);
                    const label = VENDOR_LABEL[ch.vendor];
                    return (
                      <li key={ch.vendor} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] leading-relaxed">
                        <span className="shrink-0 font-medium text-fg-soft">
                          <span className="i18n-zh">{label.zh}</span>
                          <span className="i18n-ja">{label.ja}</span>
                        </span>
                        {info.verified ? (
                          <span className="text-fg-muted">
                            {info.methods.map((m: PaymentMethod) => (
                              <span key={m} className="mr-1.5 inline-block">
                                <span className="i18n-zh">{PAYMENT_LABEL[m].zh}</span>
                                <span className="i18n-ja">{PAYMENT_LABEL[m].ja}</span>
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-fg-dim">
                            <span className="i18n-zh">支付方式待確認</span>
                            <span className="i18n-ja">支払方法は未確認</span>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[10px] leading-relaxed text-fg-dim">
                  <span className="i18n-zh">
                    支付方式依各售票平台官方說明整理；實際可用方式可能因公演或付款時間而異。
                  </span>
                  <span className="i18n-ja">
                    支払方法は各チケットサイトの公式案内に基づきます。公演や支払時期により異なる場合があります。
                  </span>
                </p>
              </div>
            )}

            {/* 购票提示：本站不售票，必须说清楚
                 ★ 它也在主色层之上，同样不能用 dim（同上） */}
            <p className="jp-accent-dim mt-3 text-[11px] leading-relaxed">
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
            {[...new Set(show.cast)].map((name) => (
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

      {/* ── 作品介紹 ──
         ★ 为什么整段在简介为空时**不渲染**而不是渲染一个空标题：
           接入真实抓取后，源站（CoRich 是用户共建库）有相当比例的条目
           根本没有登记简介 —— 实测 54 部里有 24 部。
           若照常渲染标题 + 空容器，用户会看到「作品介紹」四个字
           下面什么都没有，那是**看起来像加载失败的破图**。
           而拿工作人员名单或票价信息冒充简介更糟：
           用户会以为那串名字是剧情介绍。
           所以：有就显示，没有就不显示这一块 —— 缺信息就承认缺。
       */}
      {hasSummary && (
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
        {show.summarySources?.length ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-dim">
            <span className="i18n-zh">簡介依公開資料整理：</span>
            <span className="i18n-ja">紹介文の参考資料：</span>
            {show.summarySources.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-fg">
                <span className="i18n-zh">來源 {index + 1}</span>
                <span className="i18n-ja">資料 {index + 1}</span>
                <span aria-hidden> ↗</span>
              </a>
            ))}
          </p>
        ) : null}
        </section>
      )}

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
          {/* 卡片状态交给 LiveShowGrid 客户端实时重算（mode='all'：不过滤，只让状态徽章跟上现实） */}
          {/* 这里是页面下方，不需要 priority —— 首屏的 LCP 已经由页头海报承担 */}
          <LiveShowGrid shows={siblings.map(toCardData)} mode="all" />
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
      {/*
       * ★ 为什么标签用 .jp-accent-dim 而不是 text-fg-dim：
       *   这个 Row 只用在详情页头部，而头部铺了 .jp-accent-panel（主色层）。
       *   主色按真实海报取色后亮度上限提高到 L=0.28，实测 dim 在那里
       *   只有 3.73:1（要求 4.5）。.jp-accent-dim 把它提到 soft 档，
       *   实测 6.76:1。详见 app/globals.css 里 .jp-accent-dim 的注释。
       */}
      <dt className="jp-accent-dim w-20 shrink-0">
        <span className="i18n-zh">{labelZh}</span>
        <span className="i18n-ja">{labelJa}</span>
      </dt>
      <dd className="min-w-0 flex-1 text-fg-soft">{children}</dd>
    </div>
  );
}
