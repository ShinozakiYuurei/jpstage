'use client';

import { useRef, useState } from 'react';

/**
 * 主题切换（深色 / 粉色）
 *
 * ★★ 为什么只有两档，不再有中性浅色 ★★
 *   早先是「深 → 浅 → 粉」三档。而浅（#F1F2F6 中性浅灰）与粉（#FFF0F6）
 *   在明度、玻璃参数上几乎重合 —— 用户在切换器里分辨不出刚点到了哪一档，
 *   却要为每个新令牌在两套明色里各标一次对比度。
 *   两档下每一档都一眼可辨（一个是近黑、一个是粉），维护成本也减半。
 *
 * 首次访问由 app/layout.tsx 的启动脚本按 prefers-color-scheme 决定，
 * 这里在两档之间切换并记住手动选择。
 *
 * ===== 为什么图标用 CSS 切换而不是 React state =====
 *
 * 元件必须知道「现在哪个主题」才能画出正确的图标，而主题是**执行期**
 * 才知道的（localStorage / 系统偏好）。若用 useState + useEffect 读出来：
 *   服务端渲染 → 假设深色 → 画太阳
 *   hydrate 后  → 读到樱粉 → 换图标
 * 使用者看到图标闪一下（hydration mismatch 的典型症状）。
 *
 * 这里把所有图标都渲染进 HTML，由 CSS 依 html[data-theme] 决定显示哪一颗
 * （见 globals.css 的 .jp-theme-*）。于是：
 *   · 服务端与客户端渲染的 HTML 完全相同 → 不可能 mismatch；
 *   · 启动脚本在首次绘制前就设好了 data-theme → 首屏就是对的图标；
 *   · React state 只控制过渡期间的交互锁，不影响首屏图标。
 *
 * ===== 只有两档，所以不存在「循环顺序」问题 =====
 *
 *   深↔粉是**唯一的**一对切换，怎么点都是这两者之一，
 *   不存在「排在中间的那一档被跳过」这类问题 —— 三档循环时
 *   「顺序」才是个需要斟酌的设计决定（哪一档放中间决定了
 *   相邻两次点击的观感差异）。
 *
 * ===== 为什么 aria-label 是固定的 =====
 *
 * 无障碍上「按钮名称」应该描述**动作**，这个按钮的动作是切换主题；
 * 名称固定比依主题动态改写更稳定，也避免了需要 JS 动态更新的名称。
 */

type Theme = 'dark' | 'sakura';

/** 目前实际生效的主题（以 <html> 上的 data-theme 为唯一事实来源） */
function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'sakura' ? 'sakura' : 'dark';
}

/** 另一档 */
function nextTheme(t: Theme): Theme {
  return t === 'dark' ? 'sakura' : 'dark';
}

/** 移动端地址栏颜色，按主题同步
 *
 * ★ 这两个字面值必须与 app/globals.css 里两套主题的 --jp-canvas 一致。
 *   它们是同一件事的两次声明（一次给浏览器 UI、一次给页面），
 *   而不一致时**页面上看不出来** —— 只有手机地址栏的颜色对不上，
 *   而那块区域在桌面端根本不存在，开发时不会注意到。
 */
const THEME_COLOR: Record<Theme, string> = {
  dark: '#111113',
  sakura: '#fff0f6',
};

/** 把主题写进 DOM，并同步浏览器 UI */
export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  el.dataset.theme = theme;
  /*
   * ★ .dark 类也必须一起维护，不能只写 data-theme。
   *   Tailwind 的 dark: 变体（@custom-variant dark）只认 .dark 类。
   *   只写 data-theme 会得到「页面变白了、但 dark: 工具类仍然生效」
   *   的半明半暗状态。
   */
  el.classList.toggle('dark', theme === 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

export function ThemeToggle() {
  const [animating, setAnimating] = useState(false);
  const transitionLock = useRef(false);
  const transitionId = useRef(0);

  const chooseTheme = (theme: Theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem('jp-theme', theme);
    } catch {
      return;
    }
  };

  /*
   * 锁的覆盖面要尽量小：只锁到 startViewTransition 完成快照切换为止
   * （回调执行完、伪元素树建立好，通常只有一两帧）。
   * 用 transition.finished（动画真正播完，最长 560ms）当解锁时点，
   * 按钮会冻住大半秒。动画播放期间再点是安全的：浏览器会跳过当前
   * 过渡并接续新的切换，不会出现半明半暗的中间态。
   */
  const toggle = () => {
    if (transitionLock.current) return;
    const next = nextTheme(currentTheme());
    const root = document.documentElement;

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof document.startViewTransition !== 'function'
    ) {
      /* 无动画路径：主题立即生效，无需任何锁。 */
      chooseTheme(next);
      return;
    }

    transitionLock.current = true;
    setAnimating(true);
    root.classList.add('jp-theme-transition');

    /* jp-theme-transition 类的所有权归「最新一次过渡」：
     * 被新过渡跳过的旧过渡不得摘类，否则会拆掉新过渡的样式。 */
    const id = ++transitionId.current;
    const finishTransition = () => {
      if (transitionId.current !== id) return;
      root.classList.remove('jp-theme-transition');
      setAnimating(false);
      transitionLock.current = false;
    };

    try {
      const transition = document.startViewTransition(() => chooseTheme(next));
      transition.ready.then(
        () => {
          if (transitionId.current !== id) return;
          transitionLock.current = false;
          setAnimating(false);
        },
        () => {
          if (transitionId.current !== id) return;
          transitionLock.current = false;
        },
      );
      void transition.finished.then(finishTransition, finishTransition);
    } catch {
      finishTransition();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-disabled={animating}
      aria-label="切換主題 / テーマ切替"
      title="深色 ⇄ 櫻粉 / ダーク ⇄ さくら"
      className="jp-theme-toggle"
    >
      {/* 太阳：深色时显示，表示「下一步切到浅色」 */}
      <svg
        className="jp-theme-sun h-[18px] w-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>

      {/* 月亮：粉色时显示，表示「下一步切回深色」 */}
      <svg
        className="jp-theme-moon h-[18px] w-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
      </svg>
    </button>
  );
}
