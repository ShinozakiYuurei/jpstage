import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  allShowSpans,
  getNowShows,
  getUpcomingShows,
  getMeta,
  toCardData,
  getAllSeries,
  getShowBriefs,
} from '@/lib/data';
import { LiveCount } from '@/components/LiveCounts';
import { LiveShowGrid } from '@/components/LiveShowGrid';
import { SiteSearch } from '@/components/SiteSearch';

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
  subtitleZh: ReactNode;
  subtitleJa: ReactNode;
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

export default function HomePage() {
  const now = getNowShows();
  const upcoming = getUpcomingShows();
  const meta = getMeta();
  const spans = allShowSpans();
  const series = getAllSeries();

  return (
    <div className="space-y-10">
      {/*
       * 本页唯一的 h1
       *
       * ★ 为什么必须补：其余每个页面都有 h1（/now、/calendar…），
       *   唯独首页直接从 h2 开始 —— 大纲里首页是唯一没有标题的节点，
       *   屏幕阅读器用户按标题跳转时，首页会「没有名字」。
       *
       * ★ 为什么用 sr-only：**首页的结构就是「两条卡片条」，**
       *   它们各自的 h2（上演中 / 即將開演）已经是用户看到的全部内容。
       *   再画一个可见的「首页」大标题，等于在页面上加一句
       *   谁都不需要读的话（用户当然知道自己在哪），
       *   而且会把两条卡片条压到第二屏。
       *
       * ★ 注意它**没有**包 .i18n-*：
       *   日语模式下专有名词不变，而 `.i18n-ja` 里的那句才是日语。
       *   sr-only 元素不参与视觉，但会被朗读 —— 所以必须双语。
       */}
      <h1 className="sr-only">
        <span className="i18n-zh">日本 2.5 次元舞台劇資料庫</span>
        <span className="i18n-ja">日本2.5次元ミュージカル公演データベース</span>
      </h1>
      {/*
       * 全站搜索：只覆盖上演中与即將開演 —— 结果不与已結束混排，
       * 完结作品单独收进 /archive（檔案庫，导航里有）。日历整体
       * 收进 /calendar，首页首屏只留上演中 + 搜索。
       */}
      <SiteSearch briefs={getShowBriefs()} />
      {/* ── 上演中 ── */}
      <section>
        <SectionBar
          href="/now"
          titleZh="上演中"
          titleJa="上演中"
          subtitleZh={
            <>
              共 <LiveCount spans={spans} status="now" fallback={now.length} /> 部公演正在上演，按演出場次由多到少排列。
            </>
          }
          subtitleJa={
            <>
              <LiveCount spans={spans} status="now" fallback={now.length} /> 公演が上演中。公演数が多い順。
            </>
          }
          ctaZh="查看全部"
          ctaJa="すべて見る"
        />
        {/*
         * 卡片状态交给 LiveShowGrid 客户端实时重算：SSR 首屏仍渲染构建日
         * 算好的列表，挂载后按实时 JST 剔除已落幕/已开演的卡片。
         */}
        <LiveShowGrid
          shows={now.slice(0, PER_SECTION).map(toCardData)}
          mode="now"
          gridClassName="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4"
          priorityCount={4}
          empty={
            <p className="py-16 text-center text-fg-dim">
              <span className="i18n-zh">目前沒有上演中的公演</span>
              <span className="i18n-ja">現在上演中の公演はありません</span>
            </p>
          }
        />
      </section>

      {/* ── 即將開演 ── */}
      <section>
        <SectionBar
          href="/upcoming"
          titleZh="即將開演"
          titleJa="開幕予定"
          subtitleZh={
            <>
              共 <LiveCount
                spans={spans}
                status="upcoming"
                fallback={upcoming.length}
              />{' '}
              部公演等待開幕，按開演日排列。
            </>
          }
          subtitleJa={
            <>
              開幕を控えた公演が <LiveCount
                spans={spans}
                status="upcoming"
                fallback={upcoming.length}
              /> 件。開幕日順。
            </>
          }
          ctaZh="查看全部"
          ctaJa="すべて見る"
        />
        <LiveShowGrid
          shows={upcoming.slice(0, PER_SECTION).map(toCardData)}
          mode="upcoming"
          gridClassName="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4"
          empty={
            <p className="py-16 text-center text-fg-dim">
              <span className="i18n-zh">目前沒有即將開演的公演</span>
              <span className="i18n-ja">開幕予定の公演はありません</span>
            </p>
          }
        />
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
            {
              zh: '上演中',
              ja: '上演中',
              v: <LiveCount spans={spans} status="now" fallback={meta.counts.now} />,
            },
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
