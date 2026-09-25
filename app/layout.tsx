import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getMeta } from '@/lib/data';
import { NavLinks } from '@/components/NavLinks';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LangToggle } from '@/components/LangToggle';
import { DemoNotice } from '@/components/DemoNotice';
import { SiteFooter } from '@/components/SiteFooter';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://jpstage.example';

/**
 * 主题启动脚本（必须内联、必须阻塞）
 *
 * ===== 为什么不能写成元件或外部档 =====
 *
 * 它必须在**首次绘制之前**跑完，否则用户会先看到一帧错误的主题：
 *   页面已按深色绘制 → 脚本读到用户选的是浅色 → 整页刷白。
 * 那一下白闪（FOUC）比「不做主题切换」更难看。
 *
 * 而 React 元件（即使是 'use client'）都是在 hydrate 之后才执行，
 * 那个时间首帧早就画完了。外部 <script src> 预设 async，同样不保证时序。
 * 只有**内联的同步脚本**能保证「解析到这里就已经执行完」。
 *
 * ===== 为什么自己写而不装 next-themes =====
 *
 * 本站的启动脚本要同时处理**主题与语言**两件事（见下方 LANG 的说明），
 * 而且语言部分是自己的一套（next-themes 不管语言）。
 * 主题现在只有两档（dark / sakura），判断逻辑更是只剩两行。
 * 与其装一个库再在外面补一半逻辑，不如把这十几行写清楚 ——
 * 它足够短，也足够关键，值得被完整理解。
 *
 * ===== 为什么用 try/catch 包住 localStorage =====
 *
 * Safari 隐私模式 / 部分企业策略下访问 localStorage 会直接**抛错**，
 * 而不是返回 null。不包住的话整个脚本中断，data-theme 与 data-lang
 * 都不会被设置。那之后虽然还有 CSS 默认值兜底（暗色 + 中文），
 * 但从此无法手动切换 —— 而且是**静默**的，页面上看不出原因。
 *
 * ===== 语言为什么也要在这里设（而不是像主题那样交给 CSS） =====
 *
 * 主题可以用 prefers-color-scheme 在 CSS 里判定「系统偏好」，
 * 但**语言没有对应的 CSS 媒体查询**。所以语言的默认值只能由 JS 决定。
 * 为了让「无 JS」也有确定行为，layout 在 <html> 上预先写好 data-lang="zh"，
 * 这里只负责用 localStorage 里的值覆盖它。
 */
const BOOT_SCRIPT = `(function(){try{
var d=document.documentElement;
var t=localStorage.getItem('jp-theme');
if(t!=='sakura'&&t!=='dark'){
t=window.matchMedia('(prefers-color-scheme: light)').matches?'sakura':'dark';
}
d.dataset.theme=t;
if(t==='dark')d.classList.add('dark');
var m=document.querySelector('meta[name="theme-color"]');
if(m)m.setAttribute('content',t==='dark'?'#111113':'#fff0f6');
var g=localStorage.getItem('jp-lang');
if(g==='ja'){d.dataset.lang='ja';d.lang='ja';}
}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: '2.5次元舞台劇資料庫',
    template: '%s · 2.5次元舞台劇',
  },
  description:
    '日本 2.5 次元舞台劇、音樂劇公演資訊彙整。收錄上演中與即將開幕的公演、會場、系列作品與出演者。日本2.5次元ミュージカル・舞台の公演情報まとめ。',
  keywords: [
    '2.5次元',
    '舞台',
    'ミュージカル',
    '刀剣乱舞',
    'ハイキュー',
    '舞台化',
    '公演情報',
  ],
  openGraph: {
    type: 'website',
    locale: 'zh_Hant',
    alternateLocale: ['ja_JP'],
    siteName: '2.5次元舞台劇資料庫',
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getMeta();
  /*
   * ★ 时区必须显式指定 Asia/Tokyo。
   *   构建机器可能是 UTC / UTC+8，而「最后更新」这个时间戳是给用户看的，
   *   应该按**日本时间**呈现（公演日程就是日本的）。不指定的话，
   *   在 UTC 的 CI 上构建会显示成 9 小时前的时间，看起来像数据过期了。
   */
  const updated = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(meta.lastUpdated));

  return (
    <html
      lang="zh-Hant"
      /*
       * ★ data-lang 必须在**构建产物里**就有值，不能只靠启动脚本。
       *   否则禁用 JS 时属性不存在，两条 .i18n-* 规则都不命中，
       *   页面上一句话会中英日各显示一遍（详见 globals.css 的说明）。
       *   这里写死默认值，脚本只负责按 localStorage 覆盖。
       */
      data-lang="zh"
      suppressHydrationWarning
    >
      <head>
        {/*
         * 主题启动脚本：必须尽早同步执行，不帶 defer / async。
         * 前面的 theme-color meta 会由它立刻更新，避免地址栏颜色不匹配。
         */}
        <meta name="theme-color" content="#111113" />
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        {/* 环境光层：固定定位，不参与滚动。
         *
         * ★ 为什么是「三个真实元素」而不是两个伪元素：
         *   卡片改成液态玻璃后，身后必须有**可折射的光源**，
         *   否则 blur() 采样到的是一片纯色，玻璃看上去就是普通色块。
         *   三团光分别服务：顶栏（a1）、右侧补光（a2）、
         *   第二屏以后的卡片（a3）。伪元素只有两个名额，故改用真实元素。
         *
         * aria-hidden：它是纯装饰，且不含任何信息 ——
         *   不隐藏的话屏幕阅读器会把三个空 <i> 念出来。 */}
        <div className="jp-aurora" aria-hidden>
          <i className="a1" />
          <i className="a2" />
          <i className="a3" />
        </div>

        {/* 顶栏：真毛玻璃（固定元素，模糊开销可控）
         *
         * ★ 固定高度：用 padding 撑出来的高度会随字号/行高变动，
         *   页面里其他「需要避开顶栏」的地方（内容区 padding-top、
         *   锚点 scroll-margin）只能拍一个数字，对不上就出现内容顶进
         *   顶栏下面的叠压。现统一为 var(--jp-header-h)，
         *   内层用 h-full + items-center 垂直居中，不靠 padding 撑。
         */}
        <header className="jp-glass-bar sticky top-0 z-50 h-[var(--jp-header-h)]">
          <div className="mx-auto flex h-full max-w-6xl flex-nowrap items-center gap-2 px-3 sm:gap-4 sm:px-4">
            <Link
              href="/"
              className="shrink-0 text-base font-bold tracking-tight sm:text-lg"
            >
              {/*
               * 品牌名：中日同形（都写「2.5舞台」），所以不需要双语渲染。
               *
               * ★ 为什么两个 span 都**不**加 aria-hidden：
               *   初版写的是 <span className="sr-only">2.5次元舞台劇資料庫</span>
               *   + 可见部分 aria-hidden，于是无障碍树里读到的是
               *   「2.5 舞台 2.5次元舞台劇資料庫」—— 可见部分与 sr-only
               *   被**连起来读**，重复且啰嗦。
               *   而现在不加 aria-hidden 时，链接的可访问名就是可见文字
               *   「2.5舞台」，干净且与视觉一致 ——
               *   一个「首页链接」本来也不需要更长的名字。
               */}
              <span>2.5</span>
              <span className="text-accent">舞台</span>
            </Link>
            {/*
             * 主导航：文案与落点见 components/NavLinks.tsx
             * ★ 「上演中」指向 /now（全部上演中列表），不是首页 /。
             *   首页是只有 8 张海报的导流页，把导航项指过去等于让用户
             *   多点一次才能看到完整清单。
             */}
            <NavLinks />
            {/*
             * 语言 / 主题切换
             *
             * ★ 放在 NavLinks **之後**、ml-auto 推到最右：
             *   它們不屬於「上演中 / 即將開演 / 會場 / 系列」這一組頁面歸屬，
             *   跟在導航項後面會被當成第五、六個分頁；推到最右端才看得出
             *   它們是「工具」而不是「目的地」。
             *
             * ★ ml-auto 不能寫在導航自己身上：那樣導航會被推成右對齊，
             *   中間空出一大塊，而 logo 與導航之間本來應該是緊湊的一組。
             */}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <LangToggle />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/*
         * 内容区：padding-top 与顶栏高度对齐。
         *
         * ★ 为什么不需要「顶栏高度 + 额外间距」：顶栏是 sticky 而非 fixed，
         *   它本来就占据文档流的第一屏位置（不像 fixed 会脱离文档流），
         *   所以内容区的 py-6 是它与顶栏之间的正常视觉间距。
         *   真正需要对齐顶栏的是**锚点跳转**（见 scroll-mt 相关注释）。
         */}
        <main className="mx-auto max-w-6xl px-4 py-6">
          {/* 演示数据提示条：只在数据里还有 source==='sample' 的条目时出现。
              接入真实抓取后自动消失 —— 不需要有人记得回来删这个组件。 */}
          {meta.demo && <DemoNotice />}
          {children}
        </main>

        <SiteFooter updated={updated} />
      </body>
    </html>
  );
}
