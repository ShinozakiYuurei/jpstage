'use client';

import { useMemo, useState } from 'react';
import type { ShowBrief, ShowKind, ShowStatus, TicketVendor } from '@/lib/types';
import { KIND_LABEL, SOURCE_LABEL, VENDOR_LABEL, cityLabel } from '@/lib/i18n';
import { FilterDropdown, type FilterOption } from './FilterDropdown';
import { ShowCard } from './ShowCard';

/**
 * 公演列表浏览器（搜索 + 多维筛选）
 *
 * ===== 为什么筛选放在客户端 =====
 *
 * 本站是静态导出（output: 'export'），没有服务端可以接收 query 参数 ——
 * 若做成「服务端筛选」，就得为每个筛选组合预生成一个页面
 * （类型 5 × 城市 9 × 原作 6 × 状态 3 ≈ 810 个组合），
 * 构建时间与产物体积都不可接受，而且组合还会随数据增长。
 *
 * 客户端筛选的代价是「首屏要等 JS」。这对本站可接受：
 *   · 首屏 HTML 里已经渲染了**全部**卡片（默认无筛选），
 *     即使 JS 没跑起来，用户也能看到完整列表并点进详情页；
 *   · 数据量级是数百笔（不是数万），内存里过滤一次 < 1ms，
 *     不需要虚拟滚动或索引。
 *
 * ===== 为什么数据以 props 传入而不是组件内 import =====
 *
 * 若在客户端组件里 import lib/data.ts，那份 JSON 会被打进客户端 bundle ——
 * 而服务端渲染时它已经存在一次。两处各一份，且客户端那份无法被 tree-shake
 * （data.ts 里有大量函数在模块层建立索引，静态分析看不出哪些没用）。
 * 由服务端算好 ShowBrief[] 传进来，bundle 里就只有这几个字段。
 *
 * ===== 为什么用 useMemo 而不是每次渲染重算 =====
 *
 * 输入框每敲一个字符都会触发渲染。若每次都在渲染体里跑一遍
 * filter + 建立筛选计数，数百笔数据 × 每次按键 = 明显卡顿。
 * useMemo 以 [briefs, query, filters] 为依赖，只有真正变了才重算。
 */
type Filters = {
  kind: string[];
  city: string[];
  source: string[];
  status: string[];
  vendor: string[];
};

const EMPTY: Filters = { kind: [], city: [], source: [], status: [], vendor: [] };

/** 排序模式 */
type Sort = 'start' | 'end' | 'title';

export function ShowExplorer({
  briefs,
  /** 初始状态筛选（列表页用来「只显示上演中」或「只显示即将开演」） */
  initialStatus = [],
  /** 排序模式的初始值 */
  initialSort = 'start',
  /** 搜索框的占位文案（双语） */
  searchPlaceholder,
  /** 隐藏状态筛选（在「上演中」页里，状态筛选没有意义 —— 全部都是上演中） */
  hideStatusFilter = false,
}: {
  briefs: ShowBrief[];
  initialStatus?: ShowStatus[];
  initialSort?: Sort;
  searchPlaceholder: { zh: string; ja: string };
  hideStatusFilter?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, status: initialStatus });
  const [sort, setSort] = useState<Sort>(initialSort);

  /**
   * 筛选选项 + 各选项的命中数
   *
   * ★ 计数为什么按**其他维度的当前选择**来算，而不是全量统计：
   *   用户在「類型」里选了「音樂劇」之后，「會場」里那些没有音乐剧的
   *   城市应该显示 0 —— 否则用户点进去得到空列表，会以为站点坏了。
   *   这是筛选面板的基本体验要求（分面搜索的标准做法）。
   *
   *   实现上：对每个维度，用「除了该维度之外的筛选条件」先过滤一遍，
   *   再统计该维度各值的命中数。这样计数反映的是「再加这个条件会剩多少」。
   */
  const facets = useMemo(() => {
    const byKind = new Map<string, number>();
    const byCity = new Map<string, number>();
    const bySource = new Map<string, number>();
    const byStatus = new Map<string, number>();
    const byVendor = new Map<string, number>();

    /** 按除 exclude 之外的所有条件过滤 */
    const pass = (b: ShowBrief, exclude: keyof Filters | null, q: string) => {
      if (exclude !== 'kind' && filters.kind.length && !filters.kind.includes(b.kind)) return false;
      if (exclude !== 'city' && filters.city.length) {
        if (!b.cities.some((c) => filters.city.includes(c))) return false;
      }
      if (exclude !== 'source' && filters.source.length) {
        // sourceKind 不在 brief 里 —— 由 seriesId 前缀查表（见下方 sourceOf）
        if (!filters.source.includes(sourceOf(b.seriesId))) return false;
      }
      if (exclude !== 'status' && filters.status.length && !filters.status.includes(b.status))
        return false;
      if (exclude !== 'vendor' && filters.vendor.length) {
        // 与城市维度同一套 OR 逻辑：命中任一所选平台即算符合
        if (!b.ticketVendors.some((v) => filters.vendor.includes(v))) return false;
      }
      if (q && !b.haystack.includes(q)) return false;
      return true;
    };

    const q = query.trim().toLowerCase();
    for (const b of briefs) {
      if (pass(b, 'kind', q)) byKind.set(b.kind, (byKind.get(b.kind) ?? 0) + 1);
      if (pass(b, 'city', q)) {
        for (const c of b.cities) byCity.set(c, (byCity.get(c) ?? 0) + 1);
      }
      if (pass(b, 'source', q)) {
        const s = sourceOf(b.seriesId);
        bySource.set(s, (bySource.get(s) ?? 0) + 1);
      }
      if (pass(b, 'status', q)) byStatus.set(b.status, (byStatus.get(b.status) ?? 0) + 1);
      if (pass(b, 'vendor', q)) {
        for (const v of b.ticketVendors) byVendor.set(v, (byVendor.get(v) ?? 0) + 1);
      }
    }
    return { byKind, byCity, bySource, byStatus, byVendor };
  }, [briefs, query, filters]);

  /** 最终结果 */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = briefs.filter((b) => {
      if (filters.kind.length && !filters.kind.includes(b.kind)) return false;
      if (filters.city.length && !b.cities.some((c) => filters.city.includes(c))) return false;
      if (filters.source.length && !filters.source.includes(sourceOf(b.seriesId))) return false;
      if (filters.status.length && !filters.status.includes(b.status)) return false;
      if (filters.vendor.length && !b.ticketVendors.some((v) => filters.vendor.includes(v))) {
        return false;
      }
      if (q && !b.haystack.includes(q)) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === 'title') {
        // 按中文标题排序。localeCompare('zh-Hant') 会按汉字读音（拼音）排，
        // 而不是按 Unicode 码位 —— 后者对用户是完全无意义的顺序。
        return a.title.zh.localeCompare(b.title.zh, 'zh-Hant');
      }
      if (sort === 'end') return b.endDate.localeCompare(a.endDate);
      return a.startDate.localeCompare(b.startDate);
    });
    return out;
  }, [briefs, query, filters, sort]);

  const kindOptions: FilterOption[] = (Object.keys(KIND_LABEL) as ShowKind[]).map((k) => ({
    value: k,
    label: `${KIND_LABEL[k].zh} / ${KIND_LABEL[k].ja}`,
    count: facets.byKind.get(k) ?? 0,
  }));

  const cityOptions: FilterOption[] = [...facets.byCity.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => ({
      value: c,
      label: `${cityLabel(c, 'zh')} / ${cityLabel(c, 'ja')}`,
      count: n,
    }));

  const sourceOptions: FilterOption[] = (
    ['manga', 'anime', 'game', 'novel', 'toy', 'other'] as const
  ).map((s) => ({
    value: s,
    label: `${SOURCE_LABEL[s].zh} / ${SOURCE_LABEL[s].ja}`,
    count: facets.bySource.get(s) ?? 0,
  }));

  const statusOptions: FilterOption[] = (
    [
      { value: 'now', zh: '上演中', ja: '上演中' },
      { value: 'upcoming', zh: '即將開演', ja: '開幕予定' },
      { value: 'ended', zh: '已結束', ja: '終了' },
    ] as const
  ).map((s) => ({
    value: s.value,
    label: `${s.zh} / ${s.ja}`,
    count: facets.byStatus.get(s.value) ?? 0,
  }));

  /**
   * 售票平台选项
   *
   * ★ 为什么按「命中数」降序而不是按固定表序：
   *   三大平台（lawson / pia / eplus）几乎每部都能买，排在前面；
   *   而只有一两部的（小平台、场馆自有售票）沉到后面。
   *   固定表序会让「小众平台」这种只命中 1 部却占了首屏一格。
   *   —— 与城市维度用同一套排序，理由也相同。
   *
   * ★ 为什么排除 other：
   *   那个桶里混着主办方窗口与场馆自有售票页（实测 7 部），
   *   用户没法据此判断「去哪儿买」，所以不给它筛选入口；
   *   详情页上仍然显示那 7 部的真实链接。
   *
   * ★ 为什么零命中的平台不显示：
   *   这是「当前数据集里没有」的诚实表达；硬留着会让人以为本站
   *   坏了。数据变了它会自动出现 —— 选项是**算出来的**，不是写死的。
   */
  const vendorOptions: FilterOption[] = [...facets.byVendor.entries()]
    .filter(([v]) => v !== 'other')
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => ({
      value: v,
      label: `${VENDOR_LABEL[v as TicketVendor].zh} / ${VENDOR_LABEL[v as TicketVendor].ja}`,
      count: n,
    }));

  const sortOptions: FilterOption[] = [
    { value: 'start', label: '開演日 ↓ / 開幕日' },
    { value: 'end', label: '結束日 ↓ / 終了日' },
    { value: 'title', label: '作品名 / 作品名' },
  ];

  const activeCount =
    filters.kind.length +
    filters.city.length +
    filters.source.length +
    filters.status.length +
    filters.vendor.length +
    (query.trim() ? 1 : 0);

  const reset = () => {
    setQuery('');
    setFilters({ ...EMPTY, status: initialStatus });
  };

  return (
    <>
      {/*
       * 筛选区：sticky 吸附在顶栏下方。
       *
       * ★ top 必须等于顶栏高度（--jp-header-h）：
       *   顶栏是 sticky 且 z-50，筛选区若 top-0 会滑到顶栏**下面**被遮住。
       *   写成 calc(var(--jp-header-h)) 而不是 56px —— 顶栏高度是单一事实源，
       *   硬编码的数字在顶栏高度调整后会静默错位。
       *
       * ★ z-40 而非 50：它必须低于顶栏（否则滚动时会盖住顶栏），
       *   又要高于卡片内容。下拉菜单自己会提到 z-60（见 FilterDropdown）。
       */}
      <div className="jp-panel-sticky sticky top-[var(--jp-header-h)] z-40 mt-5 rounded-2xl p-3 sm:p-4">
        {/* 搜索框 */}
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-dim"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            /*
             * ★ 双语 placeholder 只能由 JS 呈现（input 是空元素，塞不进两个 span）。
             *   这正是双语机制的一处**已知例外**：它是运行时才决定的文案，
             *   因此不可能由 CSS 切换。做法是提供一个语言中立的提示
             *   （「作品名・出演者・会場」中日同形），而不是让 placeholder
             *   在切换时靠 JS 更新 —— 后者会让输入框在首屏闪一次文案。
             */
            placeholder={`${searchPlaceholder.zh} / ${searchPlaceholder.ja}`}
            aria-label="搜索 / 検索"
            className="w-full rounded-xl border border-hairline-strong bg-veil py-2 pl-9 pr-9 text-sm text-fg placeholder:text-fg-dim focus:border-accent/60 focus:bg-veil-strong focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="清除搜索 / 検索をクリア"
              className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-fg-dim transition hover:bg-veil-strong hover:text-fg"
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
                <path
                  d="M3 3l6 6M9 3l-6 6"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        {/*
         * 筛选器网格：手机上 2 列，平板 3 列，桌面 6 列
         *
         * ★ 为什么桌面是 6 而不是 5：
         *   加了「售票平台」之后一共有 6 个筛选器（类型 / 会场 / 原作 /
         *   状态 / 售票平台 / 排序）。5 列会让排序单独掉到第二行，
         *   而排序是最高频的操作之一 —— 让它独占一行等于每次都要多滚一次。
         *   6 列在 1280px 下每格约 200px，够放下「類型 / 種別」这类标签。
         *   （实测窄屏仍是 2 列，不受影响。）
         */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <FilterDropdown
            label="類型 / 種別"
            placeholder="所有類型"
            options={kindOptions}
            selected={filters.kind}
            onChange={(v) => setFilters((f) => ({ ...f, kind: v }))}
          />
          <FilterDropdown
            label="會場 / 会場"
            placeholder="所有城市"
            options={cityOptions}
            selected={filters.city}
            onChange={(v) => setFilters((f) => ({ ...f, city: v }))}
          />
          <FilterDropdown
            label="原作媒體 / 原作"
            placeholder="所有原作"
            options={sourceOptions}
            selected={filters.source}
            onChange={(v) => setFilters((f) => ({ ...f, source: v }))}
          />
          {!hideStatusFilter && (
            <FilterDropdown
              label="狀態 / 状態"
              placeholder="所有狀態"
              options={statusOptions}
              selected={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            />
          )}

          <FilterDropdown
            label="售票平台 / チケット"
            placeholder="所有售票处"
            options={vendorOptions}
            selected={filters.vendor}
            onChange={(v) => setFilters((f) => ({ ...f, vendor: v }))}
          />
          <FilterDropdown
            label="排序 / 並び順"
            placeholder="開演日 ↓ / 開幕日"
            options={sortOptions}
            selected={[sort]}
            onChange={(values) => {
              const next = values[0];
              if (next) setSort(next as Sort);
            }}
            selectionMode="single"
          />
        </div>

        {/* 结果摘要 + 重置 */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-dim">
          <p aria-live="polite">
            <span className="i18n-zh">
              共 <span className="font-semibold text-fg-soft">{results.length}</span> 部公演
            </span>
            <span className="i18n-ja">
              全 <span className="font-semibold text-fg-soft">{results.length}</span> 公演
            </span>
          </p>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={reset}
              className="rounded-full px-2 py-0.5 text-fg-soft underline decoration-dotted underline-offset-2 transition hover:text-fg"
            >
              <span className="i18n-zh">清除全部條件</span>
              <span className="i18n-ja">条件をすべてクリア</span>
            </button>
          )}
        </div>
      </div>

      {/* 结果网格 */}
      {results.length > 0 ? (
        <div className="jp-stagger mt-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {results.map((b, i) => (
            <div
              key={b.slug}
              style={{ '--i': Math.min(i, 24) } as React.CSSProperties}
              className="h-full"
            >
              {/*
               * 首屏优先级：只给第一行开 priority。
               * 网格是 lg:grid-cols-5，第一行即首屏可见区域。
               * 这里可能有上百张卡片，绝不能全开 —— 详见 PosterImage.tsx。
               */}
              <ShowCard show={b} priority={i < 5} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-fg-muted">
            <span className="i18n-zh">沒有符合條件的公演</span>
            <span className="i18n-ja">条件に合う公演がありません</span>
          </p>
          <button
            type="button"
            onClick={reset}
            className="jp-btn-ghost rounded-full px-4 py-2 text-xs font-semibold"
          >
            <span className="i18n-zh">清除全部條件</span>
            <span className="i18n-ja">条件をすべてクリア</span>
          </button>
        </div>
      )}
    </>
  );
}

/**
 * seriesId → 原作媒體
 *
 * ★ 为什么用「查表」而不是在 ShowBrief 里多存一个字段：
 *   原作媒體是**系列**的属性（同一个系列的所有公演媒体相同），
 *   存进每一条公演里就是重复数据 —— 数百笔各存一份，
 *   一旦某个系列改媒体（例如从「漫畫」改成「動畫」主导），
 *   要改数百处且必然漏掉几处。
 *
 * ★ 为什么表写在这里而不是 lib/data.ts：
 *   这份映射要进客户端 bundle（筛选在客户端跑）。放在 data.ts 里
 *   会连同一大堆服务端才需要的函数一起被拉进去。
 *   它足够小（24 个系列），独立成本很低。
 *
 * ★ 为什么不是「遍历 series 找 sourceKind」：
 *   那要求把整份 series.json 也打进客户端 bundle。
 *   这里只把 sourceKind 抽成一张 id → kind 的扁平表。
 */
const SERIES_SOURCE: Record<string, string> = {
  'touken-ranbu': 'game',
  'hypnosis-mic': 'other',
  haikyuu: 'manga',
  naruto: 'manga',
  kimetsu: 'manga',
  jujutsu: 'manga',
  'spy-family': 'manga',
  'tokyo-revengers': 'manga',
  utapri: 'game',
  'ensemble-stars': 'game',
  idolish7: 'game',
  'tennis-no-oujisama': 'manga',
  kuroko: 'manga',
  'bungo-stray-dogs': 'manga',
  'blue-lock': 'manga',
  'my-hero-academia': 'manga',
  gintama: 'manga',
  persona5: 'game',
  nier: 'game',
  'sailor-moon': 'manga',
  'cardfight-vanguard': 'game',
  'fruits-basket': 'manga',
  'yuri-on-ice': 'anime',
  'higeki-no-genkyou': 'novel',
};

function sourceOf(seriesId: string): string {
  return SERIES_SOURCE[seriesId] ?? 'other';
}
