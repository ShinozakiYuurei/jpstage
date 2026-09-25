import type { LocalizedText } from '@/lib/types';
import { posterGradient } from '@/lib/color';

/**
 * 示意海报（无真实海报时的降级视觉）
 *
 * ★ 为什么不显示灰色占位方块：
 *   灰方块在网格里会让整页显得「坏了一半」。而 2.5 次元公演的主视觉
 *   本来就以大面积单色 + 标题字为主，用作品主色生成相当接近真实观感；
 *   主色又来自作品本身（data/shows.json 的 accent），
 *   因此不同作品的占位图彼此可区分，用户仍能靠颜色认出「这是哪一部」。
 *
 * ★ 为什么必须**在服务端**生成（而不是客户端读图取色）：
 *   本站是静态导出，客户端取色意味着「先渲染灰块 → JS 跑起来 → 再变色」，
 *   首屏会闪一次。而在构建期算好颜色写进 HTML，首屏即最终观感。
 *   代价是颜色来自手写的 accent 字段而非真实海报 —— 这正是
 *   「接入抓取后由取色脚本覆写 accent」这条路留的口子（见 lib/types.ts）。
 *
 * ★ 为什么标题要**两种语言都渲染**（而不是传一个已选好的字符串）：
 *   与全站一致 —— 由 CSS 决定显示哪一种（见 globals.css 的双语机制）。
 *   若在这里用 props 传单一语言，语言切换就必须重渲染，
 *   等于把双语机制退化成 React state，回到首屏闪烁的老问题。
 *
 * ★ 装饰元素的 aria-hidden：
 *   斜线、光斑这些纯装饰，屏幕阅读器读到会是噪音；
 *   标题本身不 aria-hidden（它承载信息），但会同时读出中、日两遍 ——
 *   这是双语站固有的取舍。用 CSS display:none 隐藏的那一种
 *   **不在无障碍树里**，所以实际上只会读一遍（这正是选 display:none
 *   而不是 opacity/visibility 的原因之一）。
 */
export function PosterArt({
  title,
  accent,
  className,
}: {
  title: LocalizedText;
  /** 作品主色（hex），来自 data 的 accent 字段 */
  accent: string;
  className?: string;
}) {
  const { from, to, ink } = posterGradient(accent);

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className ?? ''}`}
      style={{ backgroundImage: `linear-gradient(160deg, ${from} 0%, ${to} 100%)` }}
    >
      {/*
       * 舞台光束：三条从顶部散开的斜向亮带。
       *
       * 这是「示意海报」与「纯色块」的分界 —— 没有它，卡片看起来像
       * 一个颜色占位符；有了它，一眼能读出「这是舞台作品」。
       * 用 conic-gradient 而不是三张图：零请求、零额外 DOM 语义。
       *
       * opacity 压得很低（0.1~0.16）：它是氛围，不能盖过标题。
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'conic-gradient(from 168deg at 50% -12%, transparent 0deg, rgba(255,255,255,0.16) 6deg, transparent 13deg, transparent 20deg, rgba(255,255,255,0.1) 26deg, transparent 33deg, transparent 42deg, rgba(255,255,255,0.13) 48deg, transparent 55deg)',
        }}
      />

      {/* 底部压暗：让标题与上方光束分层，也给标题一个稳定的底。
          海报下端本来就是暗的，这一层同时提高标题对比度。 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5"
        style={{
          backgroundImage:
            'linear-gradient(to top, rgb(0 0 0 / 0.55) 0%, rgb(0 0 0 / 0.18) 45%, transparent 100%)',
        }}
      />

      {/* 标题：底部对齐，与真实海报的排版习惯一致 */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p
          className="line-clamp-3 text-center text-[13px] font-bold leading-snug tracking-tight"
          style={{ color: ink, textShadow: '0 1px 8px rgb(0 0 0 / 0.45)' }}
        >
          <span className="i18n-zh">{title.zh}</span>
          <span className="i18n-ja">{title.ja}</span>
        </p>
      </div>

      {/*
       * 左上角标记「示意」
       *
       * ★ 为什么必须有这个标记：占位图做得越像真海报，越容易被误认为
       *   真的主视觉。这个角标是唯一的诚实提示，不能为了「好看」省掉。
       *   它同时解释了「为什么这张图和别的不一样」。
       */}
      <span
        aria-hidden
        className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide"
        style={{
          background: 'rgb(0 0 0 / 0.42)',
          color: 'rgb(255 255 255 / 0.82)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <span className="i18n-zh">示意</span>
        <span className="i18n-ja">イメージ</span>
      </span>
    </div>
  );
}
