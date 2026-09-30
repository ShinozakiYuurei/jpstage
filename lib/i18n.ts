import type { Lang, LocalizedText, ShowKind, SourceKind, TicketVendor } from './types';

/**
 * 語言層
 *
 * ★ 雙語的實現方式：**兩種語言都渲染進 HTML，由 CSS 決定顯示哪一種**
 *   （見 app/globals.css 的 .i18n-zh / .i18n-ja 與 components/LangToggle.tsx）。
 *
 *   為什麼不用 React state 只渲染一種：
 *     本站是靜態導出，服務端必須先假設一種語言。若用 state，hydrate 之後
 *     才讀到 localStorage 裡的另一種語言 —— 用戶會看到整頁文字**換一次**。
 *     那一下比主題閃白更難看（整頁文字全變），而且會造成 hydration mismatch。
 *
 *   代價是 HTML 裡有兩份文案 —— 實測 gzip 後只多 4.5~8.5%
 *   （兩語言的結構與 class 完全相同，只有文字節點不同，重複度極高）。
 *   換來的是「首屏語言即正確、禁用 JS 也正確」。
 *   詳細數據見 app/globals.css 的「雙語顯示機制」註釋。
 *
 *   ★ 這與主題切換是同一個模式（ThemeToggle 也是把三顆圖示都渲染進 HTML），
 *     兩者共享同一條原則：**凡是首次繪製前就必須正確的顯示狀態，都不要交給 JS 決定。**
 */
export const LANGS = ['zh', 'ja'] as const;

/** 語言代碼 → 顯示名（用**該語言自身**書寫，這是 i18n 的慣例：
 *  切換器上寫「日本語」而不是「日文」，日語用戶才認得出這是切到哪裡） */
export const LANG_LABEL: Record<Lang, string> = {
  zh: '中文',
  ja: '日本語',
};

/** 預設語言。中日雙語站，默認給中文（面向中文圈的 2.5 次元觀眾）。
 *
 * ★ 這個值必須與 app/layout.tsx 裡 <html data-lang="zh"> 的**字面值一致**。
 *   它們是同一件事的兩處聲明（一處給 JS 讀、一處寫在構建產物裡給無 JS 場景），
 *   而 CSS 的雙語規則靠 data-lang 判定 —— 兩者不一致時，
 *   禁 JS 的用戶會看到「兩種語言同時顯示」（兩條隱藏規則都不命中）。
 *   所以這裡導出它，是為了讓那個字面值有一個可被引用的出處。
 */
export const DEFAULT_LANG: Lang = 'zh';

/** 語言代碼 → <html lang> 屬性值
 *
 * ★ 為什麼 zh 是 'zh-Hant' 而不是 'zh' 或 'zh-HK'：
 *   本站面向繁體中文圈（不限香港），用 zh-Hant 比 zh-HK 準確，
 *   也比純 'zh' 更能讓瀏覽器選到正確的繁體字形。
 *   它影響瀏覽器的斷行規則、字體回退與螢幕閱讀器發音 ——
 *   所以不能省，必須跟著語言切換一起改（見 components/LangToggle.tsx）。
 */
export const HTML_LANG: Record<Lang, string> = {
  zh: 'zh-Hant',
  ja: 'ja',
};

export function isLang(v: unknown): v is Lang {
  return v === 'zh' || v === 'ja';
}

/** 取指定語言的文案；該語言為空時回退另一種，保證**永遠不會渲染出空白** */
export function pick(t: LocalizedText | undefined, lang: Lang): string {
  if (!t) return '';
  return t[lang] || t.zh || t.ja || '';
}

/**
 * 售票平台显示名
 *
 * ★ 为什么中日写法不同：
 *   平台名是**品牌**，日本用户认的是片假名写法（「イープラス」、
 *   「ローソンチケット」），而中文圈用户更常见的是「易宝乐思」这类
   音译或直接写英文原名。两种都写出来，中文模式不强迫用户认日文，
 *   日文模式仍是源站的官方写法。
 *
 * ★ 为什么筛选项显示成「中日 / 原文」而详情页只用一种：
 *   筛选项是**并排比较**的场景（用户要在一堆选项里认出一个），
 *   两种写法都给出更容易认出来；而详情页的渠道标签空间有限，
 *   且用户已经知道自己选了哪家，只显示一种即可。
 *
 * ★ 为什么键与 scripts/scrape.mjs 的 TICKET_VENDORS 一一对应：
 *   两边是**同一张表的两个面** —— 抓取那边决定「什么算 pia」，
 *   这里决定「pia 显示成什么」。若两边漂移，页面上会出现
 *   一个能筛出作品、却没有任何标签的幽灵平台。
 */
export const VENDOR_LABEL: Record<TicketVendor, LocalizedText> = {
  lawson: { zh: '樂虎（Lawson 售票）', ja: 'ローソンチケット' },
  pia: { zh: 'Ticket Pia', ja: 'チケットぴあ' },
  eplus: { zh: 'E-Plus（イープラス）', ja: 'イープラス' },
  cn: { zh: 'CN Playguide', ja: 'CNプレイガイド' },
  hikosen: { zh: '飛行船（DAQ!!）', ja: '飛行船オンラインチケット' },
  asoview: { zh: 'Asoview', ja: 'アソビュー！' },
  etix: { zh: 'E-Get / e-ティックス', ja: 'イーティックス' },
  gingeki: { zh: '天王洲銀河劇場', ja: '銀河劇場' },
  seven: { zh: 'Seven Ticket（7-Eleven）', ja: 'セブンチケット' },
  tbs: { zh: 'TBS Online Ticket', ja: 'TBSオンラインチケット' },
  rakuten: { zh: 'Rakuten Ticket', ja: '楽天チケット' },
  shochiku: { zh: 'Ticket Web 松竹', ja: 'チケットWeb松竹' },
  toho: { zh: '東宝 Navigator', ja: '東宝ナビザーブ' },
  fany: { zh: 'FANY Ticket', ja: 'FANYチケット' },
  livepocket: { zh: 'LivePocket', ja: 'LivePocket' },
  /*
   * 兜底桶：源站这一栏里混着主办方窗口与场馆自有售票页
   *（实测：テニミュ製作委員会、いばらき所做センター…），
   * 它们的共同点是「本站在册的取票处」而不是某一家票务代理。
   *
   * ★ 为什么不给它单独一个筛选项：只有 7 部命中，单独列出来
   *   是一个点进去只有 7 张卡、且用户无法据此判断「去哪儿买」的入口。
   *   详情页上仍然显示（那是真实信息），只是不进筛选器。
   */
  other: { zh: '其他售票處', ja: 'その他のチケット' },
};

/** 公演類型標籤 */
export const KIND_LABEL: Record<ShowKind, LocalizedText> = {
  musical: { zh: '音樂劇', ja: 'ミュージカル' },
  stage: { zh: '舞台劇', ja: '舞台' },
  live: { zh: '演唱會', ja: 'ライブ' },
  event: { zh: '活動', ja: 'イベント' },
  ice: { zh: '冰上秀', ja: 'アイスショー' },
};

/** 原作媒體標籤 */
export const SOURCE_LABEL: Record<SourceKind, LocalizedText> = {
  manga: { zh: '漫畫', ja: '漫画' },
  anime: { zh: '動畫', ja: 'アニメ' },
  game: { zh: '遊戲', ja: 'ゲーム' },
  novel: { zh: '小說', ja: '小説' },
  toy: { zh: '玩具', ja: '玩具' },
  other: { zh: '其他', ja: 'その他' },
};

/**
 * 都道府県 → 中文名
 *
 * ★ 為什麼需要這張表：中文使用者對「埼玉」「愛知」「福岡」這些漢字地名
 *   大多看得懂，但「大阪府」「東京都」裡的「府/都」在中文語境下不自然，
 *   而「北海道」「沖縄」在簡繁轉換上也有差異。
 *   這張表只覆蓋本站會出現的地名（不做全 47 都道府県的完整映射 ——
 *   用不到的條目就是無人維護的死資料）。
 */
export const PREF_ZH: Record<string, string> = {
  東京都: '東京都',
  大阪府: '大阪府',
  京都府: '京都府',
  愛知県: '愛知縣',
  福岡県: '福岡縣',
  北海道: '北海道',
  宮城県: '宮城縣',
  広島県: '廣島縣',
  静岡県: '靜岡縣',
  神奈川県: '神奈川縣',
  埼玉県: '埼玉縣',
  兵庫県: '兵庫縣',
  沖縄県: '沖繩縣',
  千葉県: '千葉縣',
  長野県: '長野縣',
  新潟県: '新潟縣',
  富山県: '富山縣',
  石川県: '石川縣',
  岐阜県: '岐阜縣',
  三重県: '三重縣',
  滋賀県: '滋賀縣',
  奈良県: '奈良縣',
  和歌山県: '和歌山縣',
  岡山県: '岡山縣',
  山口県: '山口縣',
  鳥取県: '鳥取縣',
  島根県: '島根縣',
  香川県: '香川縣',
  愛媛県: '愛媛縣',
  高知県: '高知縣',
  徳島県: '德島縣',
  大分県: '大分縣',
  佐賀県: '佐賀縣',
  長崎県: '長崎縣',
  熊本県: '熊本縣',
  宮崎県: '宮崎縣',
  鹿児島県: '鹿兒島縣',
  秋田県: '秋田縣',
  青森県: '青森縣',
  岩手県: '岩手縣',
  山形県: '山形縣',
  福島県: '福島縣',
  茨城県: '茨城縣',
  栃木県: '栃木縣',
  群馬県: '群馬縣',
  山梨県: '山梨縣',
  福井県: '福井縣',
};

/** 城市名 → 中文名（篩選按鈕上顯示的短標籤） */
export const CITY_ZH: Record<string, string> = {
  東京: '東京',
  大阪: '大阪',
  京都: '京都',
  名古屋: '名古屋',
  福岡: '福岡',
  札幌: '札幌',
  仙台: '仙台',
  広島: '廣島',
  静岡: '靜岡',
  横浜: '橫濱',
  埼玉: '埼玉',
  神戸: '神戶',
  沖縄: '沖繩',
  千葉: '千葉',
  長野: '長野',
  新潟: '新潟',
  富山: '富山',
  金沢: '金澤',
  岐阜: '岐阜',
  岡山: '岡山',
  山口: '山口',
  鳥取: '鳥取',
  香川: '香川',
  愛媛: '愛媛',
  大分: '大分',
  秋田: '秋田',
  宮城: '宮城',
  群馬: '群馬',
  栃木: '栃木',
  神奈川: '神奈川',
  兵庫: '兵庫',
  北海道: '北海道',
  北海: '北海道',
  さいたま: '埼玉市',
  三重: '三重',
  山形: '山形',
  山梨: '山梨',
  茨城: '茨城',
};

export function cityLabel(city: string, lang: Lang): string {
  return lang === 'zh' ? CITY_ZH[city] ?? city : city;
}

export function prefLabel(pref: string, lang: Lang): string {
  return lang === 'zh' ? PREF_ZH[pref] ?? pref : pref;
}
