'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 顶栏主导航
 *
 * 为什么单独抽成客户端组件：需要 usePathname 标记当前分页。
 * 抽出来的代价只是这一小段 JS，layout 仍是服务端组件（footer / 环境光
 * 那些依赖 data 的部分不受影响）。
 *
 * ===== 详情页的高亮归属（与 hkmovie 同一个坑） =====
 *
 * 详情页的路由是 /show/<slug>，**同一个前缀装着上演中与待演两种公演**。
 * 若拿路径前缀硬猜，所有详情页都会算作「上演中」—— 于是「即将开演」
 * 的作品点进去，顶栏色块却标在「上演中」上。
 *
 * 修法：把归属交给**真正知道答案的那一层** —— 详情页自己（它手上有
 * show.status / venue.id）在 <article data-page-nav="now|upcoming|venue|series">
 * 上写下属别，这里只负责把它读出来。三个落点因此共用同一个事实来源：
 *   1. 面包屑            —— 详情页自己用 status 推導
 *   2. 顶栏色块          —— globals.css 用 body:has([data-page-nav=…])
 *   3. 无障碍 aria-current —— 本文件的 useEffect
 *
 * ★ 属性名叫 data-page-nav（「本页属于哪一类」）而不是 data-show-nav：
 *   场馆详情页 /venue/<id> 有**完全相同**的毛病。两者共用一套机制，
 *   比分别写两套更不容易漏。
 *
 * ★ 两个属性名刻意不同（data-page-nav / data-nav）：
 *   前者是「本页属于哪一类」，只出现在详情页上；
 *   后者是「这个链接对应哪一类」，每个导航项都有。
 *   若共用一个名字，body:has([data-nav=…]) 会在**每一页**都命中导航项
 *   本身，首页也会莫名亮起「上演中」。
 *
 * href 写 "/now" 而不是 "/now/"：项目开了 trailingSlash，
 * 导出时自动补斜杠，源码里带上反而容易在别处（如 usePathname 比较）对不上。
 */
const LINKS = [
  { href: '/now', label: '上演中', labelJa: '上演中', nav: 'now' },
  { href: '/upcoming', label: '即將開演', labelJa: '開幕予定', nav: 'upcoming' },
  { href: '/calendar', label: '日曆', labelJa: 'カレンダー', nav: 'calendar' },
  { href: '/venue', label: '會場', labelJa: '会場', nav: 'venue' },
  { href: '/series', label: '系列', labelJa: 'シリーズ', nav: 'series' },
] as const;

/** 去掉尾部斜杠再比，避免 "/now" 与 "/now/" 判成两个路由 */
function norm(p: string) {
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

export function NavLinks() {
  const pathname = norm(usePathname() || '/');
  const navRef = useRef<HTMLElement>(null);

  /**
   * 横向溢出提示（两侧渐隐）
   *
   * ★ 为什么需要它：
   *   390px 下顶栏要同时容纳 logo + 5 个导航项 + 语言 + 主题，
   *   而导航需要 231px、实际只分到 164px —— 必须横向滚动。
   *   但滚动条被 .no-scrollbar 藏了，用户看不出「右边还有内容」，
   *   实测「會場」只剩 29% 可见、「系列」直接是 0% ——
   *   表现为「导航少了两项」，而不是「这里可以滑」。
   *
   * ★ 为什么用 mask（把内容本身渐隐）而不是盖一层渐变色块：
   *   顶栏是半透明玻璃，身后是页面背景与环境光。盖实色渐变会在玻璃上
   *   留下一道可见的色带；mask 透出的是顶栏自己的底，两种主题都自然。
   *
   * ★ 为什么由 JS 写 data-edge-*，不交给 CSS：
   *   CSS 无法判断「是否真的溢出」「是否已滚到端点」。写死渐隐会让
   *   桌面端（不溢出）也把最后一项淡化；而滚到端点后不撤掉渐隐，
   *   末项会永远看上去是被裁的。
   *   属性只在**真实溢出**时存在，所以首屏（属性未设）与桌面端一致，
   *   不会产生 hydration mismatch。
   */
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;

    const sync = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.dataset.edgeLeft = String(el.scrollLeft > 1);
      el.dataset.edgeRight = String(el.scrollLeft < max - 1);
    };

    sync();
    el.addEventListener('scroll', sync, { passive: true });
    /* ResizeObserver 监听窗口缩放：导航宽度变了，溢出与否也可能变。
       ★ 它**看不到**语言切换：标签宽度变了，但导航自身的盒子宽度
         由 flex 决定、不变，所以它不触发。语言切换必须另听（见下）。 */
    const ro = new ResizeObserver(sync);
    ro.observe(el);

    /* 语言切换：中/日标签长度不同（如「日曆」↔「カレンダー」），
       切完 scrollWidth 就变了，而上面两个监听都不会触发。
       不补这一处，切完语言后渐隐会停在旧状态，直到用户滚动才自愈 ——
       而「要不要滚动」正是这个提示要回答的问题，不能等它自愈。 */
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });

    return () => {
      el.removeEventListener('scroll', sync);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  /*
   * 详情页的 aria-current 补写（视觉色块由 globals.css 的 :has() 负责）
   *
   * ★ 为什么要「先算再写」而不是「先全清再补」：
   *   若写成「先清光所有 aria-current，非详情页就直接 return」，
   *   那些**服务端本来就渲染对了**的列表页，在 hydrate 之后反而会被
   *   清成没有 aria-current（因为 React 只对比自己渲染过的 props，
   *   不会收拾我们 imperative 写上的属性 —— 这也是必须用 effect 补写的
   *   根本原因）。
   *   现在改为：无论哪一页都先算出「应该亮哪一项」，再让 DOM 对齐它，
   *   幂等且不会把对的答案洗掉。
   *
   * 依赖 pathname：客户端换页（详情页 ↔ 详情页）时要重读一次 ——
   *   否则从待演公演点进上演中公演，aria-current 会停在上一次的答案上。
    *   另外，详情页的 LiveShowArticle 挂载后会按实时 JST 改写
    *   data-page-nav（公演开演/落幕时），这里要监听并跟着补跑一次，
    *   aria-current 才不会落后于顶栏色块（视觉那半边走 :has()，
    *   属性一变就自动跟）。
   */
  useEffect(() => {
    const sync = () => {
      // 详情页的归属不是路径能推的（同一个 /show 前缀装两种公演，
      // /venue/<id> 也与 /venue 不同），只能读页面自己写下的
      // [data-page-nav]；其余页面用路径即可。
      const fromPage = document.querySelector<HTMLElement>('[data-page-nav]')?.dataset.pageNav;
      const want =
        fromPage ??
        (pathname.startsWith('/show')
          ? null
          : LINKS.find((l) => l.href === pathname)?.nav ?? null);
      for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-nav]')) {
        if (a.dataset.nav === want) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      subtree: true,
      attributeFilter: ['data-page-nav'],
    });
    return () => mo.disconnect();
  }, [pathname]);

  return (
    <nav
      ref={navRef}
      /*
       * ★ 手机上这一行必须能横向滚动，不能换行
       *
       *   顶栏是 flex-nowrap，390px 下要同时容纳
       *   logo + 五个导航项 + 语言切换 + 主题切换。若允许换行，
       *   导航自身高度会从 32px 涨到 52px —— 而顶栏高度是**写死的 56px**
       *   （var(--jp-header-h)），于是内容被压住、又没地方溢出，
       *   看上去就是挤成一团。
       *
       *   加高顶栏不是解法：顶栏高度是「单一事实源」，页面里多处依赖它
       *   做锚点偏移。改由导航自己横向滚动：
       *     · flex-1 min-w-0   —— 允许它收缩，而不是把别的元素挤出去
       *     · overflow-x-auto  —— 装不下时滚动而不是溢出
       *     · no-scrollbar     —— 隐藏滚动条，视觉上与普通行无异
       *   装得下时滚动条不出现，观感与不滚动完全一样，因此桌面端不受影响。
       */
      className="no-scrollbar flex min-w-0 flex-1 gap-0.5 overflow-x-auto text-sm font-medium sm:gap-1"
    >
      {LINKS.map(({ href, label, labelJa, nav }) => {
        /*
         * ★ 只认**精确匹配**。
         *   详情页的归属不是路径能推的（见上方说明），
         *   它由 CSS 的 :has() 与上面的 effect 接管，这里不再用前缀猜。
         */
        const active = pathname === href;

        return (
          <Link
            key={href}
            href={href}
            data-nav={nav}
            aria-current={active ? 'page' : undefined}
            className={
              /*
               * ★ 手机上收紧：顶栏是 flex-nowrap，390px 下空间极紧。
               *   whitespace-nowrap 必须加：中文标签在窄容器里会一个字一行地
               *   竖着排（「即將開演」变成四行），那比横向滚动更难读。
               *
               * ★ 双语标签用 <span> 两种语言都渲染（机制见 globals.css）：
               *   导航项是最需要「首屏语言即正确」的位置 —— 它是用户第一眼
               *   看到的东西，若这里靠 JS 切换，会看到整条导航闪一下。
               */
              `shrink-0 whitespace-nowrap rounded-full px-2 py-1.5 text-[11px] transition sm:px-3 sm:text-sm ${
                active
                  ? 'bg-veil-strong font-medium text-fg'
                  : 'text-fg-muted hover:bg-veil-strong hover:text-fg'
              }`
            }
          >
            <span className="i18n-zh">{label}</span>
            <span className="i18n-ja">{labelJa}</span>
          </Link>
        );
      })}
    </nav>
  );
}
