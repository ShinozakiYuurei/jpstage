import Link from 'next/link';
import type { ShowCardData } from '@/lib/types';
import { hexToChannels } from '@/lib/color';
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
       * 主色通道值：CSS 侧要逐档控制透明度，故传空格分隔的 RGB 通道。
       *
       * ★ 为什么放在这里而不是写成 `const style = {...}`：
       *   --jp-accent-rgb 是**每张卡不同**的数据，不是主题令牌 ——
       *   它必须跟着这张卡的 show.accent 走。抽成变量只会多一层间接，
       *   而这里只有一个使用点。
       */
      style={{ '--jp-accent-rgb': hexToChannels(show.accent) } as React.CSSProperties}
      className="jp-glass jp-poster-card group flex h-full flex-col overflow-hidden rounded-2xl"
    >
      {/* 主色氛围层：整卡洗色 + 海报侧光斑（见 globals.css 的长注释） */}
      <div className="jp-accent-panel" aria-hidden />

      <div className="relative z-10 aspect-[2/3] w-full overflow-hidden bg-[var(--jp-poster-frame)]">
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

      <div className="relative z-10 flex flex-1 flex-col gap-1.5 p-3">
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

        <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1.5">
          {/* 类型标签 */}
          <span className="jp-chip shrink-0">
            <span className="i18n-zh">{KIND_LABEL[show.kind].zh}</span>
            <span className="i18n-ja">{KIND_LABEL[show.kind].ja}</span>
          </span>

          {/* 城市标签（首站）+ 巡演提示 */}
          {firstCity && (
            <span className="jp-chip shrink-0">
              <span className="i18n-zh">{cityLabel(firstCity, 'zh')}</span>
              <span className="i18n-ja">{cityLabel(firstCity, 'ja')}</span>
              {/*
               * ★ 用 text-fg-onchip 而不是 text-fg-dim：
               *   chip 自己是又一层半透明表面，会把底抬亮，
               *   dim 在其上只剩 4.19:1（实测）。详见 globals.css。
               */}
              {extraCities > 0 && <span className="text-fg-onchip">+{extraCities}</span>}
            </span>
          )}
        </div>

        {/*
         * 日期行
         *
         * ★ 为什么按状态切换显示内容：
         *   上演中 → 用户关心「演到哪天」，所以给结束日期；
         *   即将开演 → 用户关心「还有多久」，所以给倒数 + 开演日；
         *   已结束 → 用户关心「什么时候的事」，所以给完整期间。
         *   三种状态的信息需求不同，用同一套文案是偷懒。
         */}
        <p className="text-[12px] font-medium leading-tight text-fg-soft">
          {show.status === 'upcoming' ? (
            <>
              <span className="i18n-zh">{relativeDayLabel(show.startDate, 'zh')}</span>
              <span className="i18n-ja">{relativeDayLabel(show.startDate, 'ja')}</span>
              <span className="text-fg-faint"> · </span>
              <span className="tabular-nums">{formatDateShort(show.startDate)}</span>
            </>
          ) : show.status === 'now' ? (
            <>
              <span className="i18n-zh">至 </span>
              <span className="i18n-ja">〜</span>
              <span className="tabular-nums">{formatDateShort(show.endDate)}</span>
            </>
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
