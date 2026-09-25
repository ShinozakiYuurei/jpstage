import type { Lang, LocalizedText, ShowKind, SourceKind } from './types';

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
};

export function cityLabel(city: string, lang: Lang): string {
  return lang === 'zh' ? CITY_ZH[city] ?? city : city;
}

export function prefLabel(pref: string, lang: Lang): string {
  return lang === 'zh' ? PREF_ZH[pref] ?? pref : pref;
}
