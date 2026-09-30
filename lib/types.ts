/**
 * 站内数据类型
 *
 * ★ 设计前提：本站是**中日双语**聚合站，因此所有面向用户的文案字段
 *   都是 { zh, ja } 二元组，而不是「一种主语言 + 可选翻译」。
 *
 *   为什么不做成 `title: string; titleJa?: string`：
 *     那样「中文缺失」与「日文缺失」的地位不对称，日文缺失时只能回退成
 *     空字符串或中文，页面会出现「日文模式下一半是中文」的破口。
 *     二元组把两种语言都变成必填，缺数据在**构建期**就暴露
 *     （TS 报错），而不是等切到日文才发现。
 *
 *   代价是抓取脚本必须为两种语言各写一份取值逻辑（见 scripts/scrape.mjs），
 *   但这本来就是双语站的固有成本，只是从「运行时静默降级」提前到了构建期。
 */
export type Lang = 'zh' | 'ja';

export interface LocalizedText {
  zh: string;
  ja: string;
}

/** 公演状态。
 *
 *  ★ 为什么状态**存在数据里**而不是运行时按日期算：
 *    本站是静态导出（next.config.ts 的 output: 'export'），HTML 在构建时
 *    定稿。若在组件里 `new Date() > endDate` 判断，页面只反映「构建那一刻」
 *    的真实性 —— 而静态产物可能上线跑几个月，状态会越来越不准，
 *    且**只在构建时正确、之后静默错误**，属于最难发现的一类 bug。
 *    改由抓取脚本每次运行时就地判定并写进 JSON，页面只做展示。
 *    代价是数据必须定期重抓，这一点在 footer 的「最終更新」里对用户明示。
 */
export type ShowStatus = 'now' | 'upcoming' | 'ended';

/** 公演类型（2.5 次元的主要形态） */
export type ShowKind =
  | 'musical' // ミュージカル
  | 'stage' // 舞台（ストレートプレイ）
  | 'live' // ライブ / コンサート形式
  | 'event' // イベント / 上映会・トークショー
  | 'ice'; // アイスショー等の派生

/** 原作媒体（用于「原作種別」筛选） */
export type SourceKind = 'manga' | 'anime' | 'game' | 'novel' | 'toy' | 'other';

export interface Series {
  /** URL 片段，全站唯一 */
  id: string;
  name: LocalizedText;
  /** 原作作品名（含媒體），例如「ゲーム『刀剣乱舞-ONLINE-』」 */
  original: LocalizedText;
  sourceKind: SourceKind;
}

export interface Venue {
  id: string;
  name: LocalizedText;
  /** 都道府県，例如「東京都」 */
  pref: string;
  /** 城市，用于筛选聚合：東京 / 大阪 / 名古屋 / 福岡 / 札幌 / 仙台 / 広島 / 静岡 … */
  city: string;
  address: string;
  /** 座席数（官方公開値，用於「大劇場/小劇場」的直觀判斷） */
  seats?: number;
}

/** 公演期間中的一檔（同一 IP 常有多檔：東京 → 大阪 → 福岡 的巡演） */
export interface Run {
  venueId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  /** 該会場での公演数（不明なら null） */
  performances: number | null;
}

/** 月历上显示的单个会场档期（已结束的档期不包含在内） */
export interface CalendarEntry {
  slug: string;
  title: LocalizedText;
  venue: LocalizedText;
  /** 会场所属城市，用于日历筛选 */
  city: string;
  startDate: string;
  endDate: string;
  /** 此档期相对构建时日本日期的状态 */
  status: Extract<ShowStatus, 'now' | 'upcoming'>;
  performances: number | null;
}

export interface StaffMember {
  /** 職掌，例如「脚本」「演出」「音楽」 */
  role: LocalizedText;
  name: string;
}

/**
 * 售票平台（票務代理）
 *
 * ★ 为什么归一化成固定 id 而不是存源站原文：
 *   同一家在源站有十几种写法（ローソンチケット / l-tike / ローチケ /
 *   Boo-Wooチケット），而且同一家占好几个网域。存原文的话筛选器里会
 *   出现一堆指向同一家、却各自只命中一部分作品的选项 ——
 *   用户选「ローソン」会漏掉写成「l-tike」的那些。
 *   id 是**跨源稳定的**：CoRich 写「イープラス」、协会站写「イープラス」
 *   （或只写一个链接），都落到同一个 id。
 *   显示名单独放在 lib/i18n.ts 的 VENDOR_LABEL。
 */
export type TicketVendor =
  | 'lawson'
  | 'pia'
  | 'eplus'
  | 'cn'
  | 'hikosen'
  | 'asoview'
  | 'etix'
  | 'gingeki'
  | 'seven'
  | 'tbs'
  | 'rakuten'
  | 'shochiku'
  | 'toho'
  | 'fany'
  | 'livepocket'
  | 'other';

export interface TicketChannel {
  vendor: TicketVendor;
  /**
   * 该平台的**这部作品**购票页；拿不到（只有平台名或只有客服页）时为 null。
   *
   * ★ 为什么要区分「有链接」与「只有平台名」：
   *   源站把客服页（faq.l-tike.com、t.pia.jp/help/）与作品页混在同一栏。
   *   客服页只是「有问题找谁」，点进去买不到票 —— 把它当购票链接给出去，
   *   用户会以为本站指错了地方。所以只保留作品页，其余留 null。
   */
  url: string | null;
}

export interface Show {
  slug: string;
  title: LocalizedText;
  /** 副標題（很多 2.5 次元公演有「-絆-」「episode 2」這類後綴） */
  subtitle?: LocalizedText;
  seriesId: string;
  /** 製作 / 主催，例如「ミュージカル『刀剣乱舞』製作委員会」 */
  company: string;
  kind: ShowKind;
  status: ShowStatus;
  /** 全公演的起止（由 runs 聚合而來，抓取時一併算好） */
  startDate: string;
  endDate: string;
  runs: Run[];
  /**
   * 海報路徑。為 null 時卡片改畫「示意海報」（見 components/PosterImage.tsx）。
   *
   * ★ 為什麼允許 null 而不是要求一定有圖：
   *   抓取階段常常拿不到海報（官方站改版、圖片防盜鏈、新作尚未公開主視覺）。
   *   若把 poster 設為必填，抓取腳本只能塞一個佔位 URL —— 那會產生
   *   「看起來有圖、其實是 404」的假資料，比明確的 null 難查得多。
   *   明確的 null 讓 UI 走已知的降級路徑，也讓「還缺哪些海報」可被統計。
   */
  poster: string | null;
  /**
   * 作品主色（hex）。用於海報缺失時的示意圖底色、詳情頁氛圍色。
   *
   * ★ 為什麼要**手動**指定而不是像 hkmovie 那樣從海報取色：
   *   hkmovie 的取色需要先抓到海報，本站樣本資料階段沒有圖可採。
   *   等接入真實抓取後，這個欄位可以由 scripts/poster-colors.mjs 自動覆寫
   *   （同 hkmovie 的做法），屆時手動值只作為兜底 —— 兩者不衝突。
   */
  accent: string;
  officialUrl: string | null;
  /** 單一購票連結（舊欄位，保留相容；多平台請用 ticketChannels） */
  ticketUrl: string | null;
  /**
   * 可购票的平台清单。**允许为空** —— 源站并非每部作品都登记了售票处
   * （实测 70 部里有 15 部没有），缺了不代表不能买，只代表本站不知道。
   *
   * ★ 为什么不合并成一个 ticketUrl：同一部作品常常同时在三家卖
   *   （实测某作品同时有 lawson / pia / eplus 三个专属链接），
   *   只留一个会随机丢掉另外两家 —— 而「我在哪买得到」正是
   *   观众手上只有某家账号时最需要的信息。
   */
  ticketChannels: TicketChannel[];
  cast: string[];
  staff: StaffMember[];
  /** 作品紹介。允許純文字，換行用 \n（渲染時轉 <br>） */
  summary: LocalizedText;
  /** 人工补充简介的可核对资料来源（不改变档期的抓取来源） */
  summarySources?: string[];
  /** 抓取來源標識，footer 會列出全部來源 */
  source: string;
}

export interface Meta {
  lastUpdated: string;
  /** ★ 樣本資料標記：true 時頁面會顯示醒目提示條（見 components/DemoNotice.tsx）。
   *  正式接入抓取後由腳本寫成 false，提示條自動消失 —— 不需要改代碼。 */
  demo: boolean;
  counts: {
    shows: number;
    now: number;
    upcoming: number;
    venues: number;
    series: number;
  };
  sources: string[];
}

/**
 * 卡片渲染所需的最小数据
 *
 * ★ 为什么要把这个子集**显式抽出来**，而不是让卡片直接收 Show：
 *   卡片既要在**服务端**渲染（首页 / 列表页），也要在**客户端**渲染
 *   （筛选结果随用户操作实时变化，见 components/ShowExplorer.tsx）。
 *   而 Show 里带着 cast / staff / summary（双语）——
 *   一旦卡片的 props 类型是 Show，客户端就不得不把整份 JSON 打进 bundle
 *   （实测单笔约 1.5~2KB，数百笔就是数百 KB，而其中 90% 的字段
 *   卡片根本不读）。
 *   把 props 收窄到这个子集后，服务端传的 Show 与客户端传的 ShowBrief
 *   都满足它，卡片只有一份实现，而 bundle 里只会有这几个字段。
 *
 * ★ 为什么 cities 在这里就展开好，而不是让卡片自己去查 venue：
 *   查 venue 要 import lib/data.ts，而它 import 了全部 JSON ——
 *   一旦卡片（在客户端被渲染时）引用它，整份数据集就会被拉进 bundle。
 *   在数据层一次性算好，是让「卡片可被客户端渲染」成立的前提。
 */
export interface ShowCardData {
  slug: string;
  title: LocalizedText;
  /** 作品主色（hex） */
  accent: string;
  status: ShowStatus;
  kind: ShowKind;
  poster: string | null;
  startDate: string;
  endDate: string;
  /** 全部会場 id（巡演会跨多档） */
  venueIds: string[];
  /** 去重后的城市（首站在前，用于卡片上的城市标签与「+N」） */
  cities: string[];
}

/** 筛选面板用的扁平化公演摘要 */
export interface ShowBrief extends ShowCardData {
  seriesId: string;
  seriesName: LocalizedText;
  /**
   * 售票平台 id（去重）。筛选在客户端跑，所以必须进 brief。
   *
   * ★ 为什么不改成「有票/没票」这种布尔值：
   *   观众要的是「**我有的那家账号**能不能买」，而不是「有没有票」。
   *   布尔值只能回答后者，答不了前者 —— 所以原样带上 vendor id，
   *   筛选时按「命中任一所选平台」判断（与城市维度的 OR 逻辑一致）。
   *
   * ★ 为什么只带 id 不带 url：url 只在详情页渲染，列表用不到，
   *   每部作品多带几个长字符串会让客户端 bundle 白涨几十 KB。
   */
  ticketVendors: TicketVendor[];
  /** 搜索用：标题 + 系列 + 出演者 + 会場，全部小写化后拼接 */
  haystack: string;
}
