import type { Lang } from './types';

/**
 * 日期／時長格式化
 *
 * ★ 全部按**字串切片**處理，不經過 Date 的本地時區轉換。
 *
 *   資料裡的日期是 'YYYY-MM-DD'（公演日程本來就是「日期」而非「時刻」）。
 *   若寫成 new Date('2026-10-03')，它會被解析成 **UTC 午夜**，
 *   在 UTC+9（日本）或 UTC+8 顯示時都還是 10-03，看似無事；
 *   但只要構建機器的 TZ 是負偏移（如 UTC-5），toLocaleDateString 就會
 *   退回 10-02 —— 於是「同一天」在不同構建環境下渲染出不同日期。
 *   靜態站最容易踩這個：本地對、CI 錯，且只在跨月/跨年邊界暴露。
 *   切字串則完全沒有時區參與，在哪裡跑都一樣。
 */

const WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/** 取得該日期是星期幾（用 UTC 構造只為拿 index，不涉及顯示時區） */
function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 2026-10-03 → 10/03（清單卡片用，短；中日同形） */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${m}/${d}`;
}

/** 2026-10-03 → 10月3日（週六） */
export function formatDateWithWeekday(iso: string, lang: Lang): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const wd = weekdayIndex(iso);
  if (lang === 'ja') return `${y}年${m}月${d}日（${WEEKDAY_JA[wd]}）`;
  return `${m}月${d}日（週${WEEKDAY_ZH[wd]}）`;
}

/**
 * 公演期间 → 「2026年10月3日 〜 10月25日」
 *
 * ★ 为什么**没有** lang 参数：
 *   「2026年10月3日」这种写法中日完全相同（都用汉字年/月/日），
 *   所以这个函数本来就是 locale-neutral 的。
 *
 *   而初版给它加了一个 lang 参数、两个分支返回同一串 —— 那是有害的：
 *   它让读者以为「这里已经处理过本地化了」，于是当真有差异的地方
 *   （例如「週六」vs「土」、「共 64 場」vs「全64公演」）就被忽略掉。
 *   本站就真发生过这个 bug：formatPerformances 的调用方硬编码了 'zh'，
 *   日文模式下显示「共 64 場」—— 因为周围函数都「看起来已经支持双语」。
 *   假的 lang 参数比没有 lang 参数更危险。
 *
 * ★ 同年同月只写一次：2.5 次元公演多为「同月在一个会場连演」，
 *   把年份与月份重复两遍（2026年10月3日 〜 2026年10月25日）纯属噪音。
 *   跨月保留月份、跨年保留年份 —— 这三种情形涵盖了全部实际资料。
 */
export function formatPeriod(start: string, end: string): string {
  const [sy, sm, sd] = start.slice(0, 10).split('-').map(Number);
  const [ey, em, ed] = end.slice(0, 10).split('-').map(Number);
  const sep = ' 〜 ';
  if (sy === ey && sm === em) return `${sy}年${sm}月${sd}日${sep}${ed}日`;
  if (sy === ey) return `${sy}年${sm}月${sd}日${sep}${em}月${ed}日`;
  return `${sy}年${sm}月${sd}日${sep}${ey}年${em}月${ed}日`;
}

/**
 * 相對天數：用於「即將開演」列表
 *
 * ★ 基準是**日本時間（UTC+9）**而非構建機器的本地時區。
 *   公演日期是日本當地的日期，「還有幾天開演」當然要用日本的「今天」來算。
 *   若用本地時區，在 UTC-5 的構建機上會整體偏一天。
 *   （這裡不改系統時區，只把 now 偏移到 UTC+9 後取日期字串。）
 *
 * ★ 為什麼不 export：它只在下面 relativeDayLabel 裡用。
 *   對外暴露一個「回傳數字」的版本，會讓呼叫方有機會自己拼文案
 *   （「あと」還是「還有」）—— 那正是把雙語責任散到各頁的開端，
 *   而散出去之後就再也收不回來（每頁各自維護一份措辭）。
 */
function relativeDays(date: string, now: Date = new Date()): number {
  const jstNow = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const a = Date.UTC(...(date.slice(0, 10).split('-').map(Number) as [number, number, number]));
  const b = Date.UTC(...(jstNow.split('-').map(Number) as [number, number, number]));
  return Math.round((a - b) / 86400_000);
}

export function relativeDayLabel(date: string, lang: Lang, now?: Date): string {
  const n = relativeDays(date, now);
  if (n === 0) return lang === 'ja' ? '本日開幕' : '今日開演';
  if (n === 1) return lang === 'ja' ? '明日開幕' : '明日開演';
  if (n < 0) return lang === 'ja' ? `${-n}日経過` : `已開演 ${-n} 天`;
  return lang === 'ja' ? `あと${n}日` : `${n} 天後`;
}

/**
 * 公演场次数
 *
 * ★ 这是**真正需要语言区分**的函数之一，不能像日期那样去掉 lang：
 *   日文原文用「公演」（こうえん）计数，中文圈 2.5 次元观众习惯说「N 場」。
 *   两者不是同一个词，必须分开。
 *
 * ★★ 调用方必须分别传 'zh' 与 'ja' 渲染两个 span ★★
 *   初版在详情页写成了 `formatPerformances(n, 'zh')` 只渲染一次 ——
 *   于是日文模式下显示「共 64 場」。这个 bug 能躲过所有自动化检查
 *   （两个字符串都是合法文案，没有报错、没有缺字），
 *   只有真的切到日文看才会发现。
 *   probe/interactive.mjs 现在会查这类「某一语言漏渲染」。
 */
export function formatPerformances(n: number | null, lang: Lang): string {
  if (n == null) return '—';
  return lang === 'ja' ? `全${n}公演` : `共 ${n} 場`;
}
