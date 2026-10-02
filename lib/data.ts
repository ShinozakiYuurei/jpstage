import seriesJson from '@/data/series.json';
import venuesJson from '@/data/venues.json';
import showsJson from '@/data/shows.json';
import type {
  CalendarEntry,
  LocalizedText,
  Meta,
  Run,
  Series,
  Show,
  ShowBrief,
  ShowCardData,
  ShowStatus,
  Venue,
} from './types';
import { paymentMethodsOf } from './ticket-payments';

/**
 * 資料層
 *
 * ★ 這裡是全站唯一讀取 JSON 的地方，頁面與元件一律只調用本模組的函式。
 *   為什麼要這層：若各頁面自己 import JSON，任何一次資料結構調整
 *   （例如 runs 由「一個日期」改成「一個期間陣列」）都要改遍所有頁面，
 *   而 TS 只能抓到型別對不上的那幾處，抓不到「語意已經變了」的地方
 *   （例如某頁還在用 show.date 當開演日，改完仍能編譯，但語意已錯）。
 *   收在一層之後，結構調整的影響面就是這個檔案。
 *
 * ★ 為什麼 JSON 在 import 時就轉型別（as unknown as T[]）：
 *   TS 對 resolveJsonModule 匯入的 JSON 會做**結構推斷**，
 *   而 JSON 裡每個物件的欄位組合不盡相同（例如有的 show 沒有 subtitle），
 *   推出來的聯合型別極難用，且會把「欄位缺失」誤判成「型別錯誤」。
 *   這裡直接斷言成目標型別，把「資料是否符合型別」的責任交給
 *   scripts/scrape.mjs 的產出校驗（那才是真正該負責的一環）。
 */

const SERIES = seriesJson as unknown as Series[];
const VENUES = venuesJson as unknown as Venue[];
const SHOWS = showsJson as unknown as Omit<Show, 'status'>[];

/**
 * 「今天」—— 以**日本時間**為準，且只在模組載入時算一次
 *
 * ★ 為什麼是日本時間：公演日程是日本當地的日期，判定「上演中 / 即將開演」
 *   當然要用日本的日曆日。若用構建機器的本地時區，在 UTC-5 的 CI 上
 *   會整體偏一天 —— 表現為「明明昨天開演的場次還標成即將開演」。
 *
 * ★ 為什麼算一次就快取（模組層常數）：
 *   若寫成函式內 new Date()，同一次構建中不同頁面可能落在不同的毫秒上，
 *   理論上會在午夜邊界產生「A 頁說已結束、B 頁說上演中」的不一致。
 *   快取成常數後，整個構建過程共用同一個「今天」，不可能自相矛盾。
 *
 * ★ 這與 types.ts 裡「status 由抓取腳本寫入」的說明並不衝突：
 *   生產環境下 status 由腳本寫進 JSON；這裡是樣本資料階段（尚未接抓取）
 *   的等價實現，兩者都保證「構建時定稿」。接入抓取後此函式改為
 *   「讀 JSON 的 status，缺失時才用日期兜底」，對上層完全透明。
 */
const TODAY_JST = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export function getTodayJst(): string {
  return TODAY_JST;
}

/** 日期字串比較：'YYYY-MM-DD' 是字典序 = 時間序，直接用 < > 即可，無需 parse */
function computeStatus(startDate: string, endDate: string): ShowStatus {
  if (endDate < TODAY_JST) return 'ended';
  if (startDate > TODAY_JST) return 'upcoming';
  return 'now';
}

/** 由 runs 聚合出全公演的起止日期 */
function spanOf(runs: Run[]): { startDate: string; endDate: string } {
  let start = runs[0]?.startDate ?? '';
  let end = runs[0]?.endDate ?? '';
  for (const r of runs) {
    if (r.startDate < start) start = r.startDate;
    if (r.endDate > end) end = r.endDate;
  }
  return { startDate: start, endDate: end };
}

// ── 索引（模組層建一次，避免每個頁面各自 filter 一遍） ────────────────
const SERIES_BY_ID = new Map(SERIES.map((s) => [s.id, s]));
const VENUE_BY_ID = new Map(VENUES.map((v) => [v.id, v]));
const CALENDAR_CITY_ALIASES: Record<string, string> = {
  'AiiA 2.5 Theater Kobe': '神戸',
  'Kanadevia Hall': '東京',
  'シアターH': '東京',
  'シアターサンモール': '東京',
  '天王洲 銀河劇場': '東京',
  '新国立劇場 中劇場': '東京',
  '日本青年館ホール': '東京',
  '草月ホール': '東京',
  '近鉄アート館': '大阪',
  'さいたま': '埼玉',
};

function calendarCity(city: string): string {
  return CALENDAR_CITY_ALIASES[city] ?? (city === '（会場未記載）' ? '' : city);
}

const ALL_SHOWS: Show[] = SHOWS.map((s) => {
  const span = spanOf(s.runs);
  return { ...s, ...span, status: computeStatus(span.startDate, span.endDate) };
});

export function getSeries(id: string): Series | undefined {
  return SERIES_BY_ID.get(id);
}

export function getVenue(id: string): Venue | undefined {
  return VENUE_BY_ID.get(id);
}

export function getAllSeries(): Series[] {
  return SERIES;
}

export function getAllVenues(): Venue[] {
  return VENUES;
}

export function getAllShows(): Show[] {
  return ALL_SHOWS;
}

/**
 * 月历档期：以单个会场 run 为单位，保留巡演各站自己的日期和会场。
 * 已结束的场次不显示；当前档期与未来档期分别标为 now / upcoming。
 */
export function getCalendarEntries(): CalendarEntry[] {
  return ALL_SHOWS.flatMap((show): CalendarEntry[] =>
    show.runs
      .filter((run) => run.endDate >= TODAY_JST)
      .map((run): CalendarEntry => ({
        slug: show.slug,
        title: show.title,
        venue: VENUE_BY_ID.get(run.venueId)?.name ?? { zh: run.venueId, ja: run.venueId },
        city: calendarCity(VENUE_BY_ID.get(run.venueId)?.city ?? ''),
        startDate: run.startDate,
        endDate: run.endDate,
        status: run.startDate > TODAY_JST ? 'upcoming' : 'now',
        performances: run.performances,
      })),
  ).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.ja.localeCompare(b.title.ja));
}

export function getShow(slug: string): Show | undefined {
  return ALL_SHOWS.find((s) => s.slug === slug);
}

/**
 * 公演中の作品（場次多者在前）
 *
 * ★ 排序為什麼用「場次數」而不是「開演日」：
 *   即將開演的排序看日期是對的（用戶想知道「最近有什麼要開演」），
 *   但正在上演的作品，用戶想知道的是「現在有哪些在演、哪個規模最大」。
 *   場次數剛好是規模的代理指標（連演 26 場 vs 只有 4 場的巡演末站），
 *   比開演日更能反映「現在值得注意什麼」。
 */
export function getNowShows(): Show[] {
  return ALL_SHOWS.filter((s) => s.status === 'now').sort((a, b) => {
    const na = a.runs.reduce((n, r) => n + (r.performances ?? 0), 0);
    const nb = b.runs.reduce((n, r) => n + (r.performances ?? 0), 0);
    return nb - na || a.startDate.localeCompare(b.startDate);
  });
}

/** 即將開演（依開演日由近到遠） */
export function getUpcomingShows(): Show[] {
  return ALL_SHOWS.filter((s) => s.status === 'upcoming').sort((a, b) =>
    a.startDate.localeCompare(b.startDate),
  );
}

/**
 * 全部公演的档期两端（LiveCounts 客户端重算「N 部上演中」用）
 *
 * ★ 为什么只挑这两个字段：客户端重算计数需要**每部**的档期，
 *   但不需要标题、場次等其余字段 —— 几十部公演约 2KB，
 *   这是把「共 N 部上演中」搬进客户端实时重算的最小代价。
 */
export function allShowSpans(): { startDate: string; endDate: string }[] {
  return ALL_SHOWS.map((s) => ({ startDate: s.startDate, endDate: s.endDate }));
}

/**
 * 已結束（依結束日由近到遠）
 *
 * ★ 為什麼要保留已結束的資料而不是抓完就丟：
 *   2.5 次元的公演壽命短（一檔常只有 2~4 週），若移除結束場次，
 *   站上會有大量 slug 直接 404 —— 而那些 URL 正是搜尋引擎與社群
 *   最常引用的（公演期間討論度最高）。
 *   保留詳情頁、只在列表裡標「已結束」，既保住 SEO 也不誤導用戶。
 *
 * ★ 為什麼它**不**出現在任何列表頁，只被系列頁的第三個分組用到：
 *   站內沒有「已結束公演」的獨立列表頁 —— 用戶搜「最近演了什麼」的
 *   需求遠低於「最近演什麼」。它們透過**系列頁**被看到，
 *   那時用戶的意圖是「這個系列的歷史」，語境才對。
 *   （曾有一個 getUpcomingByMonth 按月分組函式，已刪：
 *     待演頁不按月分組，那個函式從來沒有任何呼叫方。）
 */
export function getEndedShows(): Show[] {
  return ALL_SHOWS.filter((s) => s.status === 'ended').sort((a, b) =>
    b.endDate.localeCompare(a.endDate),
  );
}

/** 依系列取全部公演（系列頁用），近期在前 */
export function getShowsBySeries(seriesId: string): Show[] {
  const order: Record<ShowStatus, number> = { now: 0, upcoming: 1, ended: 2 };
  return ALL_SHOWS.filter((s) => s.seriesId === seriesId).sort(
    (a, b) => order[a.status] - order[b.status] || b.startDate.localeCompare(a.startDate),
  );
}

/** 依會場取全部公演（會場頁用），近期在前 */
export function getShowsByVenue(venueId: string): Show[] {
  const order: Record<ShowStatus, number> = { now: 0, upcoming: 1, ended: 2 };
  return ALL_SHOWS.filter((s) => s.runs.some((r) => r.venueId === venueId)).sort(
    (a, b) => order[a.status] - order[b.status] || b.startDate.localeCompare(a.startDate),
  );
}

/**
 * 篩選面板用的扁平摘要
 *
 * ★ 為什麼要**另做**一份 ShowBrief，而不是直接把 Show 傳給客戶端元件：
 *   Show 含 cast / staff / summary（雙語）—— 單筆約 1.5~2KB。
 *   樣本資料 26 筆看似無所謂，但真實抓取後會有數百筆，
 *   全部塞進客戶端 bundle 會讓首屏 JS 暴漲（而且其中 90% 的欄位
 *   篩選與搜索都用不到）。
 *   ShowBrief 只保留「篩選、搜索、排序、卡片渲染」真正需要的欄位，
 *   並預先算好 haystack（搜索用的小寫拼接字串），
 *   把成本留在服務端一次算完。
 *
 * ★ haystack 為什麼要含日文假名讀音以外的全部標題：
 *   用戶可能在中文模式下用日文原名搜索（或反之）—— 2.5 次元的觀眾
 *   兩種寫法都認得。所以 haystack 同時放 zh 與 ja 標題、系列名、
 *   出演者、會場名，讓任一語言輸入都能命中。
 */
export function getShowBriefs(): ShowBrief[] {
  return ALL_SHOWS.map((s) => {
    /** 該作品的售票平台（去重）。支付方式與 verified 判定都以它為輸入 */
    const vendors = [...new Set((s.ticketChannels ?? []).map((c) => c.vendor))];
    const series = SERIES_BY_ID.get(s.seriesId);
    const venueIds = [...new Set(s.runs.map((r) => r.venueId))];
    /*
     * 城市按**首站顺序**去重。
     *
     * ★ 为什么不能用 Set 直接去重：runs 是有序的（巡演顺序：東京 → 大阪
     *   → 福岡），而 Set 会保留首次出现的顺序 —— 这一点是对的。
     *   但用 map 取 city 时要注意不能顺手 sort（那会打乱巡演顺序，
     *   卡片上的「首站城市」就变成了字母序的第一个）。
     */
    const cities: string[] = [];
    for (const r of s.runs) {
      const city = VENUE_BY_ID.get(r.venueId)?.city;
      if (city && !cities.includes(city)) cities.push(city);
    }
    const venueNames = venueIds.flatMap((id) => {
      const v = VENUE_BY_ID.get(id);
      return v ? [v.name.zh, v.name.ja] : [];
    });
    const haystack = [
      s.title.zh,
      s.title.ja,
      s.subtitle?.zh ?? '',
      s.subtitle?.ja ?? '',
      series?.name.zh ?? '',
      series?.name.ja ?? '',
      series?.original.zh ?? '',
      series?.original.ja ?? '',
      s.company,
      ...s.cast,
      ...venueNames,
    ]
      .join(' ')
      .toLowerCase();
    return {
      slug: s.slug,
      title: s.title,
      accent: s.accent,
      seriesId: s.seriesId,
      seriesName: series?.name ?? { zh: '', ja: '' },
      kind: s.kind,
      status: s.status,
      cities,
      venueIds,
      /*
       * 售票平台：只在 brief 里带 **id**，不带 url ——
       * url 只在详情页渲染，而每部作品多带几个长链接会让客户端
       * bundle 白涨几十 KB（筛选一次也用不上）。
       */
      ticketVendors: vendors,
      /*
       * 支付方式：由**平台**推导，不是作品自己的字段。
       *
       * ★ 为什么在数据层算好而不是让客户端查表：
       *   客户端组件不能 import lib/data.ts（会把整份 JSON 打进 bundle），
       *   而 lib/ticket-payments.ts 是纯表、可以进 bundle ——
       *   但既然这里已经在遍历 ticketChannels，顺手推导成本是零，
       *   客户端就只需要读一个数组，不必再维护一份「vendor → payments」查询。
       *
       * ★ 未核实的平台贡献空数组：本字段是「已知可用的方式」的并集。
       */
      payments: [...new Set(vendors.flatMap((v) => paymentMethodsOf(v).methods))],
      startDate: s.startDate,
      endDate: s.endDate,
      poster: s.poster,
      haystack,
    };
  });
}

/**
 * 完整 Show → ShowCardData
 *
 * ★ 为什么需要这个转换而不是「Show 结构上满足 ShowCardData，直接传就行」：
 *   TS 的结构子类型确实允许直接传，但 cities 是 ShowCardData **独有**的
 *   派生字段（Show 里没有），缺了它卡片会渲染成没有城市标签的空壳。
 *   而 TS 不会报错（传对象字面量才做多余属性检查，传变量不做）——
 *   这类「能编译但缺字段」正是最难发现的。
 *   提供一个显式转换函数，服务端页面就必须经过它，漏掉会直接编译失败。
 */
export function toCardData(s: Show): ShowCardData {
  const cities: string[] = [];
  for (const r of s.runs) {
    const city = VENUE_BY_ID.get(r.venueId)?.city;
    if (city && !cities.includes(city)) cities.push(city);
  }
  return {
    slug: s.slug,
    title: s.title,
    accent: s.accent,
    status: s.status,
    kind: s.kind,
    poster: s.poster,
    startDate: s.startDate,
    endDate: s.endDate,
    venueIds: [...new Set(s.runs.map((r) => r.venueId))],
    cities,
  };
}

/** 取得某會場的公演期間彙總（會場頁用來顯示「本會場的檔期」） */
export function getRunsByVenue(venueId: string): { show: Show; run: Run }[] {
  return getShowsByVenue(venueId).flatMap((show) =>
    show.runs.filter((r) => r.venueId === venueId).map((run) => ({ show, run })),
  );
}

/** 會場統計：公演數、系列數（列表頁卡片上顯示） */
export function getVenueStats(venueId: string): { shows: number; now: number } {
  const shows = getShowsByVenue(venueId);
  return { shows: shows.length, now: shows.filter((s) => s.status === 'now').length };
}

export function getMeta(): Meta {
  const now = ALL_SHOWS.filter((s) => s.status === 'now').length;
  const upcoming = ALL_SHOWS.filter((s) => s.status === 'upcoming').length;
  const usedVenues = new Set(ALL_SHOWS.flatMap((s) => s.runs.map((r) => r.venueId)));
  const usedSeries = new Set(ALL_SHOWS.map((s) => s.seriesId));
  return {
    lastUpdated: new Date().toISOString(),
    /**
     * ★ demo 旗標由**資料來源**決定，不是寫死的常數。
     *   只要有任何一筆 show 的 source 是 'sample'，全站就顯示演示提示條。
     *   這樣接入真實抓取後（source 變成站點標識），提示條自動消失 ——
     *   不需要有人記得回來改這個檔案（而「記得回來改」正是最容易漏的一步）。
     */
    demo: ALL_SHOWS.some((s) => s.source === 'sample'),
    counts: {
      shows: ALL_SHOWS.length,
      now,
      upcoming,
      venues: usedVenues.size,
      series: usedSeries.size,
    },
    sources: [...new Set(ALL_SHOWS.map((s) => s.source))],
  };
}

/** 靜態導出用的完整 slug 清單（generateStaticParams） */
export function allShowSlugs(): string[] {
  return ALL_SHOWS.map((s) => s.slug);
}

/** 靜態導出用：系列 / 會場 id 清單 */
export function allSeriesIds(): string[] {
  return SERIES.map((s) => s.id);
}

export function allVenueIds(): string[] {
  return VENUES.map((v) => v.id);
}

/**
 * 来源标识 → 显示名（footer 用）
 *
 * ★ 为什么是 LocalizedText 而不是 string：
 *   初版写成 `Record<string, string>`（'sample' → '示範資料'），
 *   于是日文模式下页脚显示「データ出典：示範資料」—— 一半日文一半中文。
 *   而抓取接入后这里的值会变成各站点的名字（「イープラス」「公式サイト」等），
 *   那些本来就需要双语写法。所以从一开始就应该是二元组。
 *
 * ★ 这个 bug 是 probe/functional.mjs 的「未标记双语文本」检查发现的：
 *   它在页脚里找到一个没被 .i18n-* 包住的「示範資料」。
 *   纯靠看代码很难发现 —— 数据层的字符串看起来不像「文案」，
 *   但它最终会被渲染成用户读到的文字。
 */
export const SOURCE_NAME: Record<string, LocalizedText> = {
  sample: { zh: '示範資料', ja: 'サンプルデータ' },
  /*
   * CoRich 舞台芸術！
   *
   * ★ 为什么用**日文原名**而不是译成「舞台艺术」：
   *   它是站点的品牌名（CoRich 舞台芸術！），而「芸術」这个词
   *   在中文语境里指的范围与日文的「芸術（此处泛指表演艺术）」不同。
   *   品牌名保持原文是通行做法，用户在页脚点过去时看到的也确实是
   *   「CoRich舞台芸術！」这几个字 —— 名称一致才对得上。
   */
  corich: { zh: 'CoRich 舞台芸術！', ja: 'CoRich舞台芸術！' },
  /*
   * 日本2.5次元ミュージカル協会
   *
   * ★ 为什么中文名用「協會」全称而不是简称：
   *   「日本2.5次元音樂劇協會」是一个法人名，页脚列出它时
   *   用户要能认出这是**官方组织**（这决定了数据的可信度）。
   *   写成「協會」或「J25」都无法传达这一点。
   */
  j25: {
    zh: '日本2.5次元音樂劇協會',
    ja: '一般社団法人 日本2.5次元ミュージカル協会',
  },
};
