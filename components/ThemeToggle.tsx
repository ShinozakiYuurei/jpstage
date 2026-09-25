'use client';

import { useRef, useState } from 'react';

/**
 * 主题切换（深色 / 浅色 / 樱粉）
 *
 * 首次访问由 app/layout.tsx 的启动脚本按 prefers-color-scheme 决定，
 * 这里在三档之间循环并记住手动选择。
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
 * ===== 三档的循环顺序为什么是 深色 → 浅色 → 樱粉 =====
 *
 * 相邻两档的视觉差异最小（深↔浅是明暗切换，浅↔樱粉是同为浅色系的色相变化），
 * 因此每一次点击的观感变化都是「温和」的，不会出现深色直接跳到粉色
 * 那种突兀感。若排成 深→粉→浅，粉与深之间的跳变最剧烈，
 * 而它恰好是最高频的一次点击（用户在深色下想试粉色只需点两下，
 * 第二次会从粉直接跳回深色）。
 *
 * ===== 为什么 aria-label 是固定的 =====
 *
 * 无障碍上「按钮名称」应该描述**动作**，这个按钮的动作是切换主题；
 * 名称固定比依主题动态改写更稳定，也避免了需要 JS 动态更新的名称。
 */

type Theme = 'dark' | 'light' | 'sakura';

/** 目前实际生效的主题（以 <html> 上的 data-theme 为唯一事实来源） */
function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'sakura' ? t : 'dark';
}

/** 下一档（循环） */
function nextTheme(t: Theme): Theme {
  return t === 'dark' ? 'light' : t === 'light' ? 'sakura' : 'dark';
}

/** 移动端地址栏颜色，按主题同步 */
const THEME_COLOR: Record<Theme, string> = {
  dark: '#111113',
  light: '#f1f2f6',
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
      title="深色 → 淺色 → 櫻粉 / ダーク → ライト → さくら"
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

      {/* 花朵：浅色时显示，表示「下一步切到樱粉」 */}
      <svg
        className="jp-theme-flower h-[18px] w-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 12c-2.5-2.2-4.5-4.2-2.8-5.9 1.1-1.1 2.4-.3 2.8 1.2.4-1.5 1.7-2.3 2.8-1.2C16.5 7.8 14.5 9.8 12 12Z" />
        <path d="M12 12c2.2-2.5 4.2-4.5 5.9-2.8 1.1 1.1.3 2.4-1.2 2.8 1.5.4 2.3 1.7 1.2 2.8C16.2 16.5 14.2 14.5 12 12Z" />
        <path d="M12 12c2.5 2.2 4.5 4.2 2.8 5.9-1.1 1.1-2.4.3-2.8-1.2-.4 1.5-1.7 2.3-2.8 1.2C7.5 16.2 9.5 14.2 12 12Z" />
        <path d="M12 12c-2.2 2.5-4.2 4.5-5.9 2.8-1.1-1.1-.3-2.4 1.2-2.8-1.5-.4-2.3-1.7-1.2-2.8C7.8 7.5 9.8 9.5 12 12Z" />
        <circle cx="12" cy="12" r="1.25" />
      </svg>

      {/* 月亮：樱粉时显示，表示「下一步切回深色」 */}
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
