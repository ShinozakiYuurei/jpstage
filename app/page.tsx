import Link from 'next/link';
import {
  getNowShows,
  getUpcomingShows,
  getMeta,
  toCardData,
  getAllSeries,
  getCalendarEntries,
  getTodayJst,
} from '@/lib/data';
import type { Show } from '@/lib/types';
import { ShowCard } from '@/components/ShowCard';
import { ShowCalendar } from '@/components/ShowCalendar';

/**
 * 首页
 *
 * 结构（沿用 hkmovie 的「卡片条 + 一屏海报」导流页形态）：
 *   1. 上演中：卡片条点击进 /now（全部上演中）
 *   2. 即將開演：卡片条点击进 /upcoming
 *   3. 系列：横向胶囊条，点击进 /series 或直接进某个系列
 *
 * ★ 为什么只展示 8 张而不是铺满：
 *   首页的职责是「指路」，不是「列全」。完整清单交给 /now 与 /upcoming ——
 *   它们是静态导出的独立页面，nginx 直接发文件，不拖累首页首屏。
 *   首页铺满会让 HTML 与首屏图片请求同时膨胀（hkmovie 实测 60 组时
 *   HTML 达 700KB+，首屏 TTFB 明显变差）。
 *
 * ★ 排序：由 lib/data.ts 的 getNowShows / getUpcomingShows 决定 ——
 *   上演中按场次多寡（规模代理指标），即将开演按开演日由近到远。
 *   为什么两者用不同排序：用户在这两个区块想知道的事情不同
 *   （详见那两个函数的注释）。
 */
const PER_SECTION = 8;

/** 卡片条：标题 + 副标题 + 「查看全部」按钮，整条可点 */
function SectionBar({
  href,
  titleZh,
  titleJa,
  subtitleZh,
  subtitleJa,
  ctaZh,
  ctaJa,
}: {
  href: string;
  titleZh: string;
  titleJa: string;
  subtitleZh: string;
  subtitleJa: string;
  ctaZh: string;
  ctaJa: string;
}) {
  return (
    <Link
      href={href}
      className="jp-glass group/bar flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5"
    >
      <div>
        <h2 className="text-xl font-bold tracking-tight text-fg">
          {/* 标题的强调字用渐变（.jp-grad-text），与 hkmovie 的视觉语言一致 */}
          <span className="i18n-zh">
            {titleZh.slice(0, -2)}
            <span className="jp-grad-text">{titleZh.slice(-2)}</span>
          </span>
          <span className="i18n-ja">
            {titleJa.slice(0, -2)}
            <span className="jp-grad-text">{titleJa.slice(-2)}</span>
          </span>
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          <span className="i18n-zh">{subtitleZh}</span>
          <span className="i18n-ja">{subtitleJa}</span>
        </p>
      </div>
      <span className="jp-btn-primary shrink-0 rounded-full px-4 py-2 text-xs font-semibold">
        <span className="i18n-zh">{ctaZh}</span>
        <span className="i18n-ja">{ctaJa}</span>
        <span aria-hidden> →</span>
      </span>
    </Link>
  );
}

/** 海报网格 */
function PosterGrid({ shows }: { shows: Show[] }) {
  return (
    <div className="jp-stagger mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
      {shows.map((s, i) => (
        <div key={s.slug} style={{ '--i': i } as React.CSSProperties} className="h-full">
          {/*
           * 首屏优先级：只给**第一行**海报（前 4 张）开 priority。
           *
           * 为什么是 4：网格是 md:grid-cols-4，第一行 4 张即首屏可见区域。
           * 为什么不全开：priority 会让图片立即请求并 fetchpriority=high，
           *   16 张同时抢带宽反而拖慢真正的 LCP 元素（浏览器并发连接有限，
           *   高优先级请求之间仍会互相排队）。只标首屏第一行收益最大。
           */}
          <ShowCard show={toCardData(s)} priority={i < 4} />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const now = getNowShows();
  const upcoming = getUpcomingShows();
  const meta = getMeta();
  const series = getAllSeries();

  return (
    <div className="space-y-10">
      {/* ── 上演中 ── */}
      <section>
        <SectionBar
          href="/now"
          titleZh="上演中"
          titleJa="上演中"
          subtitleZh={`共 ${now.length} 部公演正在上演，按規模排列。`}
          subtitleJa={`${now.length} 公演が上演中。規模順。`}
          ctaZh="查看全部"
          ctaJa="すべて見る"
        />
        <PosterGrid shows={now.slice(0, PER_SECTION)} />
        {now.length === 0 && (
          <p className="py-16 text-center text-fg-dim">
            <span className="i18n-zh">目前沒有上演中的公演</span>
            <span className="i18n-ja">現在上演中の公演はありません</span>
          </p>
        )}
      </section>

      {/* ── 即將開演 ── */}
      <section>
        <SectionBar
          href="/upcoming"
          titleZh="即將開演"
          titleJa="開幕予定"
          subtitleZh={`共 ${upcoming.length} 部公演等待開幕，按開演日排列。`}
          subtitleJa={`開幕を控えた公演が ${upcoming.length} 件。開幕日順。`}
          ctaZh="查看全部"
          ctaJa="すべて見る"
        />
        <PosterGrid shows={upcoming.slice(0, PER_SECTION)} />
        {upcoming.length === 0 && (
          <p className="py-16 text-center text-fg-dim">
            <span className="i18n-zh">目前沒有即將開演的公演</span>
            <span className="i18n-ja">開幕予定の公演はありません</span>
          </p>
        )}
      </section>

      {/* ── 日历入口 ── */}
      <section>
        <Link
          href="/calendar"
          className="jp-glass group flex items-center gap-4 rounded-2xl p-4 transition sm:p-5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-veil-strong text-accent">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
              <path d="M7.5 3v4M16.5 3v4M3.5 9.5h17" />
              <path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-fg group-hover:text-accent">
              <span className="i18n-zh">按日期瀏覽<span className="jp-grad-text">演出日曆</span></span>
              <span className="i18n-ja">日付から探す<span className="jp-grad-text">公演カレンダー</span></span>
            </span>
            <span className="mt-1 block text-sm text-fg-muted">
              <span className="i18n-zh">查看每天正在演出和即將演出的舞台劇</span>
              <span className="i18n-ja">日ごとの上演中・開幕予定の公演をチェック</span>
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-lg text-fg-dim transition group-hover:translate-x-1 group-hover:text-accent">→</span>
        </Link>
        <div className="mt-4">
          <ShowCalendar entries={getCalendarEntries()} today={getTodayJst()} />
        </div>
      </section>

      {/* ── 系列 ──
       *
       * ★ 为什么首页要放这一块（而不是只在导航里留一个入口）：
       *   2.5 次元的观众找公演的方式**不是**按日期，而是按作品 ——
       *   「刀劍亂舞今年有什麼」是最高频的查询意图。
       *   把系列做成首页的横向胶囊条，等于把这条主路径提到首屏。
       *   它同时解释了「为什么同一个作品会出现好几张卡片」。
       */}
      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-hairline pb-2.5">
          <h2 className="text-lg font-semibold tracking-tight text-fg">
            <span className="i18n-zh">依系列瀏覽</span>
            <span className="i18n-ja">シリーズから探す</span>
          </h2>
          <Link
            href="/series"
            className="text-xs text-fg-dim transition hover:text-fg"
          >
            <span className="i18n-zh">全部 {series.length} 個系列 →</span>
            <span className="i18n-ja">全 {series.length} シリーズ →</span>
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {series.map((s) => (
            <Link
              key={s.id}
              href={`/series/${s.id}`}
              className="jp-chip transition hover:border-accent/50 hover:text-fg"
            >
              <span className="i18n-zh">{s.name.zh}</span>
              <span className="i18n-ja">{s.name.ja}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 数据规模摘要 ──
       *
       * ★ 为什么首页要显示这个：它是「这个站有多少内容」的唯一提示。
       *   聚合站在没有搜索流量时，用户第一眼会怀疑「是不是只有几部」。
       *   明确列出总数与覆盖范围（会場数、系列数）能立刻回答这个问题。 */}
      <section className="jp-panel rounded-2xl p-5">
        <h2 className="text-sm font-semibold tracking-tight text-fg">
          <span className="i18n-zh">收錄範圍</span>
          <span className="i18n-ja">収録範囲</span>
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            { zh: '公演', ja: '公演', v: meta.counts.shows },
            { zh: '上演中', ja: '上演中', v: meta.counts.now },
            { zh: '會場', ja: '会場', v: meta.counts.venues },
            { zh: '系列', ja: 'シリーズ', v: meta.counts.series },
          ].map((it) => (
            <div key={it.zh}>
              <dt className="text-xs text-fg-dim">
                <span className="i18n-zh">{it.zh}</span>
                <span className="i18n-ja">{it.ja}</span>
              </dt>
              <dd className="jp-num text-xl font-bold text-fg">{it.v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
