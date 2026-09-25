import Link from 'next/link';
import type { ShowCardData } from '@/lib/types';
import { PosterImage } from './PosterImage';
import { PosterArt } from './PosterArt';
import { KIND_LABEL, cityLabel, pick } from '@/lib/i18n';
import { formatDateShort, formatPeriod, relativeDayLabel } from '@/lib/format';

/**
 * 公演卡片
 *
 * 海报区：海报本身（或示意海报）+ 右上角状态徽章
 * 文字区：标题（双语，两行截断）
 *         类型 · 城市 · 期间（或倒数）
 *
 * ★ 卡片上**不放**的元素及理由（沿用 hkmovie 的取舍）：
 *   1. 出演者名单 —— 一张卡上列 5 个名字，视觉噪音极大，而它对
 *      「要不要点进去」的决策贡献很小（阵容在详情页有完整呈现）。
 *   2. 场次数 —— 与期间混在一行里，两个数字并列反而都不突出。
 *   3. 制作公司 —— 同类型信息在详情页有位置，卡片上属于噪音。
 *
 * ★ 为什么状态徽章叠在**海报**上而不是文字区：
 *   文字区那一行已经承载「类型 · 城市 · 期间」三项，再塞一个徽章会
 *   变成四项并排（实测在 375px 屏上直接换行，把卡片撑高）。
 *   叠在海报右上角则是零成本 —— 那个位置本来就空着，
 *   而状态是「这张卡要不要现在点」的第一决策信息，放在视觉最重的位置合理。
 *
 * ★ 主色氛围层（.jp-accent-panel）为什么在卡片里而不是海报里：
 *   它是**卡片**的背景（网易云播放页那种「整块背景跟着封面变色」），
 *   要铺满整张卡（含文字区），而不是只铺海报。所以它是卡片的直接子元素，
 *   z-0 压在内容之下；海报与文字区各自 z-10 浮在上面。
 *   --jp-accent-rgb 走内联 style：它是每张卡不同的数据，不是主题令牌。
 */
export function ShowCard({
  show,
  priority = false,
}: {
  /**
   * 卡片数据。
   *
   * ★ 类型是 ShowCardData 而不是 Show：Show 满足这个结构（结构子类型），
   *   所以服务端可以直接传 Show；而客户端筛选结果传的是 ShowBrief
   *   （它 extends ShowCardData）。两种来源共用同一个卡片实现。
   *   若这里写成 Show，客户端就必须把 cast/staff/summary 也打进 bundle ——
   *   详见 lib/types.ts 里 ShowCardData 的注释。
   */
  show: ShowCardData;
  /**
   * 首屏可见的卡片传 true：海报立即加载并提高抓取优先级。
   * 默认 false，由调用方按「是否首屏」显式开启 —— 避免全部卡片
   * 都抢带宽，反而拖慢真正的 LCP 元素。
   */
  priority?: boolean;
}) {
  /*
   * ★ 城市只取首站，其余折成「+N」：
   *   全国巡演会横跨 4~5 个城市，全列出来会让信息行占满两行
   *   （实测「東京・大阪・福岡・札幌」在 375px 屏上换行）。
   *   首站是用户最可能关注的一场（通常也是最大的一档），
   *   其余用「+N」提示「这是一次巡演」，具体会場在详情页完整列出。
   *
   * ★ 为什么按**城市**去重而不是按会場：同一城市内换会場（例如
   *   東京巨蛋城 vs 舞浜）对用户不是「去了另一个地方」，
   *   列成「東京・東京」是明显的错误。城市才是巡演的语义单位。
   */
  const firstCity = show.cities[0] ?? '';
  const extraCities = show.cities.length - 1;

  const statusClass =
    show.status === 'now'
      ? 'jp-status jp-status--on-art jp-status--now'
      : show.status === 'upcoming'
        ? 'jp-status jp-status--on-art jp-status--upcoming'
        : 'jp-status jp-status--on-art';

  return (
    <Link
      href={`/show/${show.slug}`}
      /*
       * ★★ 卡片上**没有**主色氛围层（.jp-accent-panel）★★
       *
       *   初版每张卡都铺了一层主色（参照的是 hkmovie 详情页头部的做法），
       *   结果整个列表变成一面彩色方块墙 —— 蓝/橙/绿/红/紫各占一块。
       *   而没有真实海报时（全是示意占位图），页面更是只剩颜色。
       *
       *   实测对照 hkmovie 线上：它的卡片是
       *       hkm-glass hkm-poster-card     ← 就这两个类，纯玻璃
       *   而 hkm-accent-panel **只出现在详情页头部**
       *   （components/MovieIntro.tsx:247）。
       *
       *   为什么详情页可以铺、卡片不可以：
       *     详情页一屏只有**一个**主色，它是「这一部作品的氛围」，
       *     用户此刻的注意力就在这一部上；
       *     而列表页一屏有 20 个主色，它们彼此竞争，谁也不是主角 ——
       *     结果是整体变成一个没有层次的调色盘，反而看不清任何一部。
       *     这是「同一种手法在不同信息密度下效果相反」的典型例子。
       *
       *   主色因此只留在：
       *     · 详情页头部（与 hkmovie 一致）
       *     · 示意占位图的暗底微光（见 PosterArt.tsx，那里也刻意压得很低）
       */
      className="jp-glass jp-poster-card group flex h-full flex-col overflow-hidden rounded-2xl"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[var(--jp-poster-frame)]">
        {show.poster ? (
          <PosterImage
            src={show.poster}
            alt={pick(show.title, 'zh')}
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            priority={priority}
          />
        ) : (
          <PosterArt title={show.title} accent={show.accent} />
        )}

        {/* 状态徽章：叠在海报右上角。

              ★ 类名带 --on-art 而不是直接复用 --now / --upcoming：
                叠在**海报**上与叠在**玻璃**上需要两套配色，
                因为海报的颜色与页面主题无关（详见 globals.css 里
                .jp-status--on-art 的长注释与实测数据）。 */}
        <span className={`${statusClass} absolute right-2 top-2 shadow-lg`}>
          <span className="i18n-zh">
            {show.status === 'now' ? '上演中' : show.status === 'upcoming' ? '即將開演' : '已結束'}
          </span>
          <span className="i18n-ja">
            {show.status === 'now' ? '上演中' : show.status === 'upcoming' ? '開幕予定' : '終了'}
          </span>
        </span>
      </div>

      <div className="jp-poster-card__info flex flex-1 flex-col gap-1.5 p-3">
        {/*
         * 标题：两行截断。
         *
         * ★ 为什么是两行而不是一行（与 hkmovie 的一行不同）：
         *   2.5 次元公演的标题普遍很长（「舞台『呪術廻戦』-懐玉・玉折-」
         *   这种「作品名 + 副标题」结构），一行截断会把副标题整段切掉 ——
         *   而副标题往往正是区分「这是哪一版」的关键（同一作品常有多部）。
         *   两行刚好容纳「作品名 + 副标题」，超过的极少。
         *
         * line-clamp 的 -webkit- 前缀由 Tailwind 自动处理，无需手写。
         */}
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-fg">
          <span className="i18n-zh">{show.title.zh}</span>
          <span className="i18n-ja">{show.title.ja}</span>
        </h3>

        {/*
         * 信息行：**一行**，纯文本用「·」分隔。
         *
         * ★★ 为什么从「两个 chip 标签 + 单独日期行」改成一行纯文本 ★★
         *
         *   实测对比（同宽 270px 的卡片，暗色主题）：
         *     hkmovie  文字区高 87px   ← 标题 + 一行信息
         *     jpstage  文字区高 121px  ← 标题 + chip 行 + 日期行（初版）
         *   卡片因此比对方高 34px（524 vs 490），一屏少看到小半行卡片。
         *
         *   更关键的是**观感**：两行标签把信息摊平了，每项都不突出；
         *   而一行紧凑的文字里，日期是视觉重点（它是用户选片的第一依据），
         *   类型与城市是附注 —— 主次分明。
         *
         *   hkmovie 的写法是「94分鐘 · $40 起」这种「数字 + 单位」并列结构，
         *   本行沿用同一形式（不是抄外观，是同一类信息用同一种排版）。
         *
         * ★ 为什么不再用 .jp-chip：
         *   chip 是「分类标签」的视觉语言，适合筛选面板与详情页；
         *   卡片上每张都挂两枚彩色胶囊，20 张卡就是 40 枚，
         *   它们会与海报、状态徽章一起把卡片填满 —— 而卡片要回答的
         *   只是「这是什么、什么时候、在哪里」。
         *
         * ★ 按状态切换显示内容：
         *   上演中 → 用户关心「演到哪天」；
         *   即将开演 → 用户关心「还有多久」；
         *   已结束 → 用户关心「什么时候的事」。
         *   三种状态的信息需求不同，用同一套文案是偷懒。
         */}
        <p className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-2 text-[13px] font-medium text-fg-soft">
          {/* 类型：中日同形的短词，两种语言都渲染 */}
          <span>
            <span className="i18n-zh">{KIND_LABEL[show.kind].zh}</span>
            <span className="i18n-ja">{KIND_LABEL[show.kind].ja}</span>
          </span>

          {firstCity && (
            <>
              <span className="text-fg-faint">·</span>
              <span>
                <span className="i18n-zh">{cityLabel(firstCity, 'zh')}</span>
                <span className="i18n-ja">{cityLabel(firstCity, 'ja')}</span>
                {/* 巡演：首站之外的会場数，只用一个小小的 +N */}
                {extraCities > 0 && <span className="text-fg-dim">+{extraCities}</span>}
              </span>
            </>
          )}

          <span className="text-fg-faint">·</span>

          {show.status === 'upcoming' ? (
            <span className="tabular-nums">
              <span className="i18n-zh">{relativeDayLabel(show.startDate, 'zh')}</span>
              <span className="i18n-ja">{relativeDayLabel(show.startDate, 'ja')}</span>
            </span>
          ) : show.status === 'now' ? (
            <span className="tabular-nums">
              <span className="i18n-zh">至 </span>
              <span className="i18n-ja">〜</span>
              {formatDateShort(show.endDate)}
            </span>
          ) : (
            <span className="tabular-nums">
              {/* 中日同形（都用汉字年/月/日），无需双语渲染 */}
              {formatPeriod(show.startDate, show.endDate)}
            </span>
          )}
        </p>
      </div>
    </Link>
  );
}
