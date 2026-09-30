/**
 * 抓取脚本 —— CoRich 舞台芸術！（stage.corich.jp）
 *
 * ════════════════════════════════════════════════════════════════════
 *  数据源
 * ════════════════════════════════════════════════════════════════════
 *
 *  CoRich 舞台芸術！是日本演劇／ミュージカル的公演数据库（用户共建），
 *  它有一个专门的 **「2.5次元舞台」分类**（category_id=7），用于补充历史档案。
 *  当前公演则优先抓取日本2.5次元ミュージカル協会（J25）的官方日程与详情。
 *
 *  ★ 为什么保留 CoRich，而不只抓「各公演官网」：
 *    2.5 次元没有单一权威源 —— 每个企划各有官网，结构各不相同，
 *    要接就得给每个站写一个解析器（几十个），且任一官网改版就断。
 *    CoRich 把它们的档期、会場、海报统一成了一个结构 ——
 *    这是「一个解析器覆盖全部企划」与「N 个解析器覆盖 N 个企划」的差别。
 *
 *  ★ 代价必须说清楚：CoRich 是**用户共建**数据库，条目由剧团/观众登记。
 *    所以：
 *      · CoRich 是用户共建数据，officialUrl 仅作核对入口，购票前务必确认；
 *      · 出演者、场次数字段经常是空的（很多条目只登记了档期与会場）；
 *      · 数据可能滞后于官方公告。
 *    因此本站每条数据都带 officialUrl，页脚也明写「以官方公布为准」——
 *    这不是免责话术，而是这个数据源的真实性质。
 *
 * ════════════════════════════════════════════════════════════════════
 *  两个页面层级：stage_main（作品）与 stage（单会場）
 * ════════════════════════════════════════════════════════════════════
 *
 *  CoRich 把一次巡演拆成两层：
 *    /stage_main/<id>   作品总页 —— 一部作品（含全部巡演会場）
 *    /stage/<id>        单会場页 —— 该作品在某一个会場的那一档
 *
 *  ★ 为什么不直接抓 /stage/*（搜索结果里全是它）：
 *    搜索列表里「名探偵プリキュア！ドリームステージ♪」出现 **48 次**
 *    （每个会場一条），直接抓会生产 48 部「同名公演」，
 *    而它们其实是**同一部作品的 48 个档期**。
 *    本站的 Show.runs 正是为这种「一部作品多档巡演」设计的 ——
 *    所以必须从 stage 页爬回 stage_main，按作品合并。
 *
 *  ★ 归并键是 stage_main_id 而不是作品名：
 *    同名作品（例如再演、前編/後編）名字相同或极相近，
 *    按名字合并会把两部不同的公演并成一部。
 *    stage_main_id 是 CoRich 的作品主键，唯一且稳定。
 *
 * ════════════════════════════════════════════════════════════════════
 *  双语数据从哪来
 * ════════════════════════════════════════════════════════════════════
 *
 *  CoRich 是纯日文站，所以每个面向用户的文案都要自己补中文。三条路径：
 *
 *   ① **译名表**（data/zh-names.json）→ 优先。
 *      热门 IP 数量有限，而它们的官方中文译名是稳定且唯一的，
 *      值得人工维护。实测机器翻译会把「刀剣乱舞」译成「剑乱舞」、
 *      「呪術廻戦」译成「诅咒之战」—— 都是不可接受的。
 *   ② **机器翻译**（MyMemory API，ja → zh-CN）→ 兜底。
 *   ③ **OpenCC**（zh-CN → zh-Hant）→ 把②的结果转成繁体，
 *      因为本站面向繁体中文圈（用词差异实打实：
 *      「音乐剧」vs「音樂劇」，简繁不是字形替换而已）。
 *
 *  ★ 为什么②+③而不是直接翻成繁体：
 *    MyMemory 的 ja→zh-TW 实测质量明显差于 ja→zh-CN
 *    （「プリキュア」被译成「預治」），而 OpenCC 的简→繁是词典转换，
 *    不会引入新的错译。翻得准比一步到位重要。
 *
 * ════════════════════════════════════════════════════════════════════
 *  用法
 * ════════════════════════════════════════════════════════════════════
 *
 *    node scripts/scrape.mjs              抓取（写 data/*.json + 下载海报）
 *    node scripts/scrape.mjs --validate-only    只校验现有数据（不联网）
 *    node scripts/scrape.mjs --no-posters      跳过海报下载
 *    node scripts/scrape.mjs --no-translate    跳过机器翻译（只用译名表）
 *    node scripts/scrape.mjs --refresh-posters 强制重评全部海报（默认只重评「糊」的）
 *    node scripts/scrape.mjs --posters-only    只重跑海报（从现有 data/shows.json 出发）
 *
 *  ★ 抓取是**幂等**的：结果只取决于源站当前数据，重复跑不会累积。
 *    海报按 slug 命名，已存在且大小合理就跳过（可断点续跑）。
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySummarySupplements } from './summary-supplements.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const POSTER_DIR = path.join(ROOT, 'public', 'posters');
const CACHE_DIR = path.join(ROOT, '.cache');

const args = new Set(process.argv.slice(2));
const VALIDATE_ONLY = args.has('--validate-only');
const NO_POSTERS = args.has('--no-posters');
const NO_TRANSLATE = args.has('--no-translate');
/** 强制对已缓存的海报重新取主色（改了取色算法后用） */
const REBUILD_ACCENT = args.has('--rebuild-accent');
/** 忽略清晰度判定，强制重新评估每一张海报（改了选图逻辑后用） */
const REFRESH_POSTERS = args.has('--refresh-posters');
/** 只重跑海报（不重抓公演数据），用于单独修「糊图」而不动 dataset */
const POSTERS_ONLY = args.has('--posters-only');

/**
 * 海报「糊」的判定阈值（拉普拉斯方差，越大越清晰）
 *
 * ★ 为什么需要它：海报是按 slug 缓存的，早先抓到的糊图会一直留着，
 *   表现为「改了代码、线上还是糊的」。有了阈值才能判定
 *   「这张要不要重新选图」（见 sharpnessOf 的注释）。
 *
 * ★ 为什么是 900：实测本站 43 张海报里，肉眼可见偏糊的集中在
 *   270~600（低清放大），清楚的在 1000 以上，中间空档明显。
 *   阈值只用于**触发重新选图**，不是最终判决 —— 最终换不换图
 *   由候选之间的清晰度比较决定，所以定得略宽松无妨。
 *   可用环境变量 POSTER_MIN_LAP 覆盖。
 */
const POSTER_MIN_LAP = Number(process.env.POSTER_MIN_LAP || 900);

/**
 * 海报「有效」的下限（拉普拉斯方差）
 *
 * ★ 为什么要比 POSTER_MIN_LAP 再低一条线：
 *   新作海报尚未公开时，源站会返回「NOW PRINTING」占位图
 *   （实测 death-note-1168 是一张 280×400、lap≈3 的空白图）。
 *   这种图比「没有海报」更糟 —— 页面上会显示一张「印刷中」的假图，
 *   而本站本来就能生成一张像样的示意海报（PosterArt）。
 *   低于这条线就判定为占位/空白，宁可置空。
 */
const POSTER_MIN_ACCEPT_LAP = 100;

/** 海报取色失败时的兜底主色（见 Show.accent 的注释） */
const DEFAULT_ACCENT = '#6b46e5';
/** 保留全部历史条目（不做半年时间窗过滤） */
const KEEP_ALL = args.has('--keep-all');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

/**
 * 请求间隔（毫秒）
 *
 * ★ 为什么必须限速：源站是用户共建的小站，抓取会打在它的 Rails 上。
 *   并发打过去轻则被限流、重则把对方拖慢 —— 而本站的收益
 *   （早 30 秒抓完）远小于「把数据源搞到封我们」的代价。
 *   1.2s 是「够快又不失礼」的量级：62 部作品的详情页约需 2 分钟。
 */
const DELAY_MS = 1200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * HTML 磁盘缓存
 *
 * ★ 为什么需要它：调取色算法、调翻译、调归并逻辑都要**反复重跑**，
 *   而每次重跑都把 178 个详情页 + 74 个会場页重新抓一遍 ——
 *   既慢（约 6 分钟），又不必要地压在对方服务器上。
 *   把抓到的 HTML 存进 .cache/ 后，除第一次外的重跑都是**离线**的：
 *   几秒钟出结果，且不再打对方服务器。
 *
 * ★ 为什么缓存默认开、且没有「跳过缓存」的开关：
 *   磁盘缓存只在**当次抓取会话**内可信，所以每次正式抓取开始时
 *   都先清理上次的缓存。否则页面结构虽正常，数据却可能悄悄过期。
 *   会话内缓存用于复用同一 URL；下一轮开始时失效。
 *
 * ★ 为什么 key 用 URL 的哈希而不是 URL 本身：URL 里含日文与查询串，
 *   直接做文件名在 Windows 上会撞上非法字符与长度限制。
 */
const HTML_CACHE = new Map();
const cachePath = (url) =>
  path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.html');

/** 带重试的 GET。
 *
 * ★ 为什么要重试：源站在我们这种「连续翻页 + 详情页」的访问模式下
 *   偶发 502/超时（实测出现过）。不重试的话一次抖动就丢一部作品，
 *   而丢的那部**不会报错** —— 只是站上少一部，几天后才发现。
 */
async function get(url, { timeout = 8000, retries = 2 } = {}) {
  if (HTML_CACHE.has(url)) return HTML_CACHE.get(url);
  const file = cachePath(url);
  if (fs.existsSync(file)) {
    const cached = fs.readFileSync(file, 'utf8');
    HTML_CACHE.set(url, cached);
    return cached;
  }
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      HTML_CACHE.set(url, text);
      try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, text, 'utf8');
      } catch {
        /* 缓存写不进去不影响抓取本身 */
      }
      return text;
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

/** 抓二进制（海报） */
async function getBinary(url, { timeout = 25000, retries = 2 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1024) throw new Error(`too small: ${buf.length}B`);
      return buf;
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1200 * (i + 1));
    }
  }
}

// ────────────────────────────────────────────────────────────
// HTML → 文本的小工具（不引 cheerio：源站结构稳定，正则够用且零依赖）
//
// ★ 为什么不用 cheerio：本脚本要能在「只有 node_modules 的基础依赖」
//   下跑（部署机上不装 devDependencies 也能跑 validate）。
//   而这里需要的只是「取出某个标签里的文字」，正则足够。
// ────────────────────────────────────────────────────────────

/** 去掉标签、折叠空白、解码常见实体
 *
 * ★ 必须容忍 null/undefined：解析用的正则在页面结构变化时经常匹配不到，
 *   而调用方几乎都是 textOf(first(...)) —— 不加这一层，一次页面改版
 *   就会让整个脚本崩在半路（已经抓到的几十部全丢）。
 *   返回空字符串后，上层的「字段为空」分支会正常处理（跳到下一个源或留空）。
 */
function textOf(html) {
  if (html == null) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 取第一个匹配的捕获组 */
function first(re, s) {
  const m = s.match(re);
  return m ? m[1] : null;
}

// ────────────────────────────────────────────────────────────
// 售票平台（票務代理）
// ────────────────────────────────────────────────────────────

  /*
   * ★ 归一化表不是「凭印象列的知名平台」，而是《从 862 个缓存详情页里统计出来的实际写法》（见下方分布）。
   *   这一点很关键：凭印象写会漏掉大量真实存在、用户天天在用的平台 ——
   *   飞行船（44 部）、アソビュー！（44 部）、e-ティックス（42 部）
   *   都不是「众所周知的三大天王」，但在 2.5 次元的票务里占比很高。
   *
   * ★ 为什么每个平台都同时给 hosts 与 names：
   *   链接的网域最可靠（源站把「ローソンチケット」链到 l-tike.com），
   *   但协会站常只写《纯文本》（没有链接）；反过来，
   *   同一个平台在 CoRich 上又有多个网域（ローソン一家就占三个：
   *   l-tike.com / www2.lawsonticket.com / www.tennimu.com）。
   *   两者取并集，任一命中即认。
   */
  const TICKET_VENDORS = [
    // ── 三大主力（627 + 449 + 419 = 1495 次，占全部条目的绝大多数）──
    { id: 'lawson', hosts: ['l-tike.com', 'lawsonticket.com', 'l-tike.jp'], names: [/ローソンチケット/, /ローチケ/, /Boo-?Wo[oō]チケット/] },
    { id: 'pia', hosts: ['pia.jp', 'pia.co.jp', 'pia-get.com'], names: [/チケットぴあ/, /^ぴあ$/, /メ〜?チケ/] },
    { id: 'eplus', hosts: ['eplus.jp'], names: [/イープラス/] },
    // ── 中量级（8~77 部不等，都是真实售票窗口）──
    { id: 'cn', hosts: ['cnplayguide.com', 'cncn.jp'], names: [/CNプレイガイド/] },
    { id: 'hikosen', hosts: [], names: [/飛行船オンラインチケット/, /^飛行船$/] },
    { id: 'asoview', hosts: ['urakata.app'], names: [/アソビュー！?/] },
    { id: 'etix', hosts: ['e-tix.jp', 'e-get.jp'], names: [/イーティックス/, /e-?GET(?:！|!)?/i] },
    { id: 'gingeki', hosts: ['gingeki.jp'], names: [/銀河劇場/, /天王洲 銀河劇場/] },
    { id: 'seven', hosts: ['7ticket.jp'], names: [/セブンチケット/] },
    { id: 'tbs', hosts: ['tbs.co.jp'], names: [/TBS(?:オンラインチケット|チケット)/] },
    { id: 'rakuten', hosts: ['r-t.jp', 'rakuten.co.jp'], names: [/楽天チケット/] },
    { id: 'shochiku', hosts: ['ticket-web-shochiku.com'], names: [/チケット\s*[Ww][Ee][Bb]松竹/, /^松竹$/] },
    { id: 'toho', hosts: ['toho-navi.com'], names: [/東宝ナビザーブ/] },
    { id: 'fany', hosts: ['fany.lol'], names: [/FANY(?:\s*Ticket)?/i] },
    { id: 'livepocket', hosts: ['livepocket.jp'], names: [/LivePocket/i] },
  ];const TICKET_VENDOR_IDS = new Set([...TICKET_VENDORS.map((v) => v.id), 'other']);
const TICKET_VENDOR_ORDER = new Map(TICKET_VENDORS.map((v, i) => [v.id, i]));

/** 取网域（拿不到返回空串 —— 源站里有 mailto: 与 tel: 这类非 http 链接） */
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * (链接, 文字) → 售票平台 id；认不出返回 null
 *
 * ★★ 为什么**先认文字、后认网域** ★★
 *   两个不同服务共用同一个网域：CoRich 上「飛行船オンラインチケット」
 *   与「CNプレイガイド」链的都是 www.cnplayguide.com（实测 44 + 77 次）。
 *   若按网域先判，所有飞行船都会被算成 CNプレイガイド ——
 *   筛选器里选「CNプレイガイド」会捞出根本没在 CN 买的作品。
 *   文字是源站自己写的、且在同一个框里并排出现，歧义远小于网域，
 *   所以文字优先；网域只用来兜住「只有链接、没有文字」的情况。
 */
function ticketVendorOf(href, label) {
  for (const v of TICKET_VENDORS) {
    if (v.names.some((re) => re.test(label))) return v.id;
  }
  const host = href ? hostOf(href) : '';
  if (host) {
    for (const v of TICKET_VENDORS) {
      if (v.hosts.some((d) => host === d || host.endsWith('.' + d))) return v.id;
    }
  }
  return null;
}

/**
 * 这个链接是不是**这部作品**的售票页
 *
 * ★ 为什么要判：源站把两类东西混在同一栏里 ——
 *   ① 作品专属的售票页（l-tike.com/m-tourabu/）；
 *   ② 各家的**客服入口**（faq.l-tike.com、t.pia.jp/help/、mailto:）。
 *   ②只是「有问题找谁」，点进去买不到票。若当成购票链接给出去，
 *   用户会以为本站指错了地方。
 *   判据是「网域是客服子域」或「路径落在 faq/help/support/contact 下」，
 *   两者都不像作品页 —— 作品页总是带作品名的 slug。
 */
function isShowSpecificTicketUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false; // mailto: / tel: 等一律不是购票页
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (/^(faq|help|support|contact)\./i.test(u.hostname)) return false;
  const path = u.pathname.replace(/\/+$/, '');
  if (!path) return false; // 站点首页
  if (/^\/(faq|help|support|hc|contact)(\/|$)/i.test(path)) return false;
  return true;
}

/** 同一平台只留一条；优先保留**带作品专属链接**的那条 */
function mergeTicketChannels(entries) {
  const byVendor = new Map();
  for (const { vendor, url } of entries) {
    const prev = byVendor.get(vendor);
    if (prev === undefined) byVendor.set(vendor, url);
    else if (prev === null && url) byVendor.set(vendor, url);
  }
  return [...byVendor]
    .sort((a, b) => (TICKET_VENDOR_ORDER.get(a[0]) ?? 99) - (TICKET_VENDOR_ORDER.get(b[0]) ?? 99))
    .map(([vendor, url]) => ({ vendor, url }));
}

/** CoRich 作品总页侧栏「チケット取扱い」→ 售票平台 */
function corichTicketChannels(html) {
  const block = first(
    /<div id="sidePG">\s*<p class="header"><span>チケット取扱い<\/span><\/p>\s*<ul class="BlankLink">([\s\S]*?)<\/ul>/,
    html,
  );
  if (!block) return [];
  const entries = [];
  for (const m of block.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const href = m[1].replace(/&amp;/g, '&');
    const label = textOf(m[2]);
    entries.push({
      vendor: ticketVendorOf(href, label) ?? 'other',
      url: isShowSpecificTicketUrl(href) ? href : null,
    });
  }
  return mergeTicketChannels(entries);
}

/**
 * 协会站详情页「チケットに関するお問い合わせ」→ 售票平台
 *
 * ★ 为什么只认**认得出的平台**、且一律不带链接：
 *   这一栏的标题就是「お問い合わせ（咨询）」，里面既有平台名，
 *   也有「公演事務局」「サンライズプロモーション」这类主办方窗口，
 *   而链接全是客服页（faq.l-tike.com / support-qa.eplus.jp / mailto:）。
 *   把主办方窗口当成售票平台、把客服页当成购票链接，都是错的 ——
 *   所以这里只取「能对上某个平台的**名字**」这一件事。
 */
function j25TicketChannels(html) {
  const block = first(
    /<h3>チケット(?:・公演)?に関するお問い合わせ(?:先)?[\s\S]*?<\/h3>\s*<p>([\s\S]*?)<\/p>/,
    html,
  );
  if (!block) return [];
  const entries = [];
  for (const m of block.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const vendor = ticketVendorOf(m[1].replace(/&amp;/g, '&'), textOf(m[2]));
    if (vendor) entries.push({ vendor, url: null });
  }
  const text = textOf(block);
  for (const v of TICKET_VENDORS) {
    if (v.names.some((re) => re.test(text))) entries.push({ vendor: v.id, url: null });
  }
  return mergeTicketChannels(entries);
}

/**
 * 两组档期有没有交集
 *
 * 只被「跨源认领售票平台」的守卫用到（见双源合并）：
 * 合并键是标题，而同一部作品会隔年再演，标题完全一样。
 */
function runsOverlap(a, b) {
  for (const x of a) {
    for (const y of b) {
      if (x.start <= y.end && y.start <= x.end) return true;
    }
  }
  return false;
}


// ────────────────────────────────────────────────────────────
// 译名层
// ────────────────────────────────────────────────────────────

const zhNames = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'zh-names.json'), 'utf8'));

/**
 * 作品名 → 中文译名
 *
 * ★ 为什么先**查表**再考虑机器翻译：
 *   实测机器翻译会把「刀剣乱舞」译成「剑乱舞」、「呪術廻戦」译成「诅咒之战」、
 *   「ヒプノシスマイク」译成「师饶舌战」。这些名字在中文圈早有定译，
 *   机器翻译的结果对 2.5 次元观众来说是**错的**（不只是别扭）。
 *   表覆盖不到的长尾再走翻译，且翻译结果会被记入报告，便于人工补表。
 */
function lookupZh(jaTitle) {
  // 长键优先：「新テニスの王子様」必须在「テニスの王子様」之前命中
  const keys = Object.keys(zhNames.series).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (jaTitle.includes(k)) return { zh: zhNames.series[k].zh, matched: k };
  }
  return null;
}

/** 从作品名推断系列 id（用于归并同一 IP 的不同公演） */
function inferSeries(jaTitle) {
  const keys = Object.keys(zhNames.series).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (jaTitle.includes(k)) {
      return { key: k, name: zhNames.series[k], kind: zhNames.sourceKind[k] ?? 'other' };
    }
  }
  return null;
}

/** 简→繁转换（懒加载：只在真的要翻译时才 require，--no-translate 时零开销） */
let toTrad = null;
function trad(s) {
  if (!toTrad) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const OpenCC = require('opencc-js');
    toTrad = OpenCC.Converter({ from: 'cn', to: 'tw' });
  }
  return toTrad(s);
}

/** 翻译缓存：同一段文字只翻一次（省额度，也让重跑变快） */
const TR_CACHE = new Map();

/** 翻译失败的**原因**计数（最后汇总打印，便于判断要不要补译名表） */
const TR_FAIL = { quota: 0, other: 0 };

/**
 * 两次翻译请求之间的最小间隔
 *
 * ★ 为什么要限速：连发时 MyMemory 会开始返回 429 / WARNING 文案，
 *   而 translateToZh 对「额度用完」是**不再重试**的 ——
 *   结果就是一轮抓取只翻成个位数条，其余全部回退成日文。
 *   实测加 350ms 间隔后 10/10 成功。
 */
const TR_DELAY_MS = 350;

/**
 * 单次翻译请求
 *
 * ★ 超额的三重识别，缺一不可：
 *   ① HTTP 429 —— 最明确的信号
 *   ② responseStatus 非 200
 *   ③ 译文里出现 WARNING 文案 —— 有些情况下 HTTP 仍是 200，
 *      但 translatedText 是一段英文提示。不识别就会把
 *      「MYMEMORY WARNING: YOU USED ALL…」当成译文写进数据。
 */
async function translateOnce(key) {
  const u =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(key) +
    '&langpair=ja%7Czh-CN';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(u, { signal: ctrl.signal });
    const j = await res.json();
    const raw = j?.responseData?.translatedText;
    if (!res.ok || j.responseStatus !== 200 || !raw) {
      return {
        out: null,
        quota: res.status === 429 || /USAGE LIMIT|ALL AVAILABLE FREE/i.test(raw ?? ''),
      };
    }
    if (/MYMEMORY WARNING|QUERY LENGTH LIMIT|USAGE LIMIT/i.test(raw)) return { out: null, quota: true };
    return { out: trad(raw), quota: false };
  } catch {
    return { out: null, quota: false };
  } finally {
    clearTimeout(t);
  }
}

/**
 * 机器翻译（MyMemory，免费额度）
 *
 * ★ 为什么它是**兜底**而不是主路径：见 lookupZh 的注释。
 *
 * ★ 为什么失败时返回 null 而不是返回原文：
 *   返回原文等于「中文模式下显示日文」，页面上看不出是翻译失败
 *   还是数据本来如此。返回 null 后调用方会回退到日文原名 ——
 *   那至少是**真的**（日文原名不会错），且 validate 会统计出来。
 *
 * ★★ 为什么必须区分「额度用完」与「其他失败」★★
 *   MyMemory 免费额度是**每日**限额（实测 5000 字/日量级），
 *   超限后所有请求都返回 429 + 一段英文提示（而不是报错）。
 *   若不区分，跑完看到「24 条简介是日文」只会以为是翻译质量差，
 *   而真实原因是**额度没了**—— 明天重跑就有了。
 *   这个区别决定了接下来该做什么（补译名表 vs 改天再跑），
 *   所以要在输出里说清楚。
 */
async function translateToZh(ja) {
  if (!ja) return null;
  const key = ja.slice(0, 480);
  if (TR_CACHE.has(key)) return TR_CACHE.get(key);

  let out = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500);
    await sleep(TR_DELAY_MS);
    const r = await translateOnce(key);
    if (r.out) {
      out = r.out;
      break;
    }
    if (r.quota) {
      TR_FAIL.quota++;
      break;
    }
    TR_FAIL.other++;
  }

  TR_CACHE.set(key, out);
  return out;
}

/**
 * 翻译记忆预热：用上一版 data/shows.json 填 TR_CACHE
 *
 * ★★ 为什么必须预热，而不能每次重抓都从零翻 ★★
 *   MyMemory 免费额度是**每日** 5000 字量级，而全部简介有 1.7 万字 ——
 *   一轮抓取不可能翻完。若不预热：
 *     ① 额度会被「上一轮已经翻过的旧作品」重新吃掉，新作品永远轮不到；
 *     ② 更糟的是 translateToZh 失败时 summary.zh 会回退成日文，
 *        于是「补翻」反而把上一轮的成果洗掉 —— 越补越少。
 *   预热后：旧作品 0 消耗（命中缓存直接返回），额度全留给新作品；
 *   且中文永不回退 —— 每跑一轮就多补几部，直到补全。
 *
 * ★ 为什么拿 shows.json 当记忆库而不是另建文件：
 *   上一版产物里已经有完整的 ja→zh 对照（简介/标题/副标题），
 *   它本来就是「翻译过的那些条」的权威列表，再存一份只会两处漂移。
 */
function seedTranslationMemory() {
  const file = path.join(DATA_DIR, 'shows.json');
  if (!fs.existsSync(file)) return 0;
  let previous;
  try {
    previous = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return 0;
  }
  let seeded = 0;
  const seed = (ja, zh) => {
    if (!ja || !zh || ja === zh) return;
    const key = ja.slice(0, 480);
    if (TR_CACHE.has(key)) return;
    TR_CACHE.set(key, zh);
    seeded++;
  };
  for (const show of previous) {
    seed(show.summary?.ja, show.summary?.zh);
    seed(show.title?.ja, show.title?.zh);
    if (show.subtitle) seed(show.subtitle.ja, show.subtitle.zh);
  }
  return seeded;
}

// ────────────────────────────────────────────────────────────
// 解析：搜索列表
// ────────────────────────────────────────────────────────────

/**
 * 解析搜索结果页里的条目
 *
 * ★ 只取 5 个字段（id / 标题 / 团体 / 会場 / 档期），其余一律不在这里解析：
 *   列表页是「够用来决定要不要抓详情页」的最小集合。
 *   把「取全部字段」写在这里的话，源站列表页一改版，
 *   整条 pipeline 就一起断；收窄到这几个字段则只有详情页解析需要改。
 */
function parseSearchPage(html) {
  const out = [];
  const re =
    /<a href="\/stage\/(\d+)" class="list-group-item[\s\S]*?<p class="stage">([\s\S]*?)<\/p>[\s\S]*?<p class="group">([\s\S]*?)<\/p>[\s\S]*?<p class="theater">([\s\S]*?)<span class="pref">（([\s\S]*?)）[\s\S]*?<p class="period">[\s\S]*?(\d{4}\/\d{2}\/\d{2}) \(.\) ～ (\d{4}\/\d{2}\/\d{2}) \(.\)/g;
  for (const m of html.matchAll(re)) {
    out.push({
      stageId: m[1],
      title: textOf(m[2]),
      group: textOf(m[3]),
      theater: textOf(m[4]),
      pref: textOf(m[5]),
      start: m[6].replace(/\//g, '-'),
      end: m[7].replace(/\//g, '-'),
    });
  }
  return out;
}

/** 列表页里的海报图 URL（medium 尺寸） */
function parseSearchPoster(html, stageId) {
  const re = new RegExp(
    '<a href="/stage/' +
      stageId +
      '" class="list-group-item[\\s\\S]*?<div class="pict"><img[^>]*src="([^"]+)"',
  );
  return first(re, html);
}

/** 总件数（用于翻页） */
function parseHitCount(html) {
  const m = html.match(/1-(\d+)件 \/ (\d+)件中/);
  if (m) return { shown: +m[1], total: +m[2] };
  if (/0-0件/.test(html)) return { shown: 0, total: 0 };
  return null;
}

// ────────────────────────────────────────────────────────────
// 解析：详情页（/stage_main/<id> 作品总页）
// ────────────────────────────────────────────────────────────

/**
 * 作品总页 → 一部作品的完整数据
 *
 * ★ 为什么抓 stage_main 而不是 stage（单会場）：
 *   巡演的全部档期只在总页上（单会場页只有自己那一档）。
 *   本站的 Show.runs 就是为「一部作品多档」设计的，
 *   总页一次拿全，比抓 N 个单会場页再合并省 N-1 次请求。
 */
function parseMainPage(html, mainId) {
  const data = { mainId };

  // 作品名
  data.title = textOf(first(/<h1 class="name">([\s\S]*?)<\/h1>/, html) ?? '');
  if (!data.title) return null;

  // 分类（CoRich 的「2.5次元舞台」等大类）
  data.category = textOf(first(/<div class="boxes category">\s*<span>([\s\S]*?)<\/span>/, html) ?? '');

  // ★ kind 取 <p class="crown"> 而不是从标题里猜：
  //   crown 是 CoRich 明确登记的「ミュージカル / 舞台 / 朗読劇」等形态，
  //   而标题里的「ミュージカル」可能是作品名的一部分（例如某作品就叫
  //   「○○ミュージカル」）。用登记值，不用推断值。
  data.crown = textOf(first(/<p class="crown">(.*?)<\/p>/, html) ?? '');

  // 副标题：2.5 次元公演普遍带「〜イーストサイドストーリー〜」这类后缀，
  // 它往往是「这是哪一版」的关键，必须单独取。
  data.subtitle = textOf(first(/<p class="subTitle">(.*?)<\/p>/, html) ?? '');

  // 团体（制作委员会）
  data.group = textOf(first(/<p class="group"><a[^>]*>([\s\S]*?)<\/a>/, html) ?? '');

  // 官方站
  const urls = [...html.matchAll(/<p class="urlLine">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  data.officialUrl = urls.length ? urls[0][1] : null;

  // 简介（説明）
  //
  // ★ 为什么空简介是**正常结果**而不是解析 bug：
  //   CoRich 是用户共建库，「説明」这一格大量条目根本没填（实测 54 部里
  //   有 24 部为空）。此时 <td> 是空标签 —— 解析正确，数据就是没有。
  //   若为了「填满」而拿旁边的「スタッフ」或「その他注意事項」冒充简介，
  //   用户会读到一串工作人员名单当剧情介绍 —— 那才是错的数据。
  const descCell = first(/<th><a id="comment"><\/a>説明<\/th>\s*<td>([\s\S]*?)<\/td>/, html);
  data.description = descCell ? textOf(descCell) : '';

  // 出演 / スタッフ（表格行）
  const rows = [...html.matchAll(/<tr>\s*<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)];
  const cell = (name) => {
    for (const r of rows) {
      const th = textOf(r[1]);
      if (th === name) return textOf(r[2]);
    }
    return '';
  };
  data.castRaw = cell('出演');
  data.staffRaw = cell('スタッフ');
  data.periodRaw = cell('期間');

  // crown → kind（缺 crown 时退回标题推断）
  const k = data.crown || data.title;
  data.kind = /ミュージカル/.test(k)
    ? 'musical'
    : /朗読劇/.test(k)
      ? 'event'
      : /ライブ|コンサート/.test(k)
        ? 'live'
        : /アイスショー|スケート/.test(k)
          ? 'ice'
          : 'stage';

  // 全巡演会場（select 里的 option）
  //
  // ★ 为什么要「全部」会場而不只取第一个：
  //   搜索列表里的「主会場」是 CoRich 内部排序的结果（常是最后一场），
  //   把它当首站会得到「巡演顺序倒着显示」的错。
  //   这里按档期日期排序，首站就是真正最早开演的那一场。
  data.venues = [];
  const selRe = /(<select name="stage_id"[\s\S]*?<\/select>)/;
  const sel = first(selRe, html);
  if (sel) {
    for (const m of sel.matchAll(/<option value="(\d+)">【(.+?)】\s*([\s\S]*?)<\/option>/g)) {
      data.venues.push({ stageId: m[1], pref: m[2].trim(), name: textOf(m[3]) });
    }
  }
  // 没有 select（单会場公演）时，用页面上的会場链接
  if (!data.venues.length) {
    const th = first(/<p class="theater"><a href="\/theater\/(\d+)">([\s\S]*?)<\/a><span class="pref">（([\s\S]*?)）/, html);
    if (th) data.venues.push({ stageId: null, pref: textOf(th[3]), name: textOf(th[2]), theaterId: th[1] });
  }

  /*
   * 海报候选（按尺寸从大到小）。
   *
   * ★ 为什么保留**全部**尺寸而不是只留最大的一张：
   *   CoRich 的 l 并不总是最合适的一张 —— 有的作品 l 是一张横版
   *   舞台照（实测 640×452），裁成 2:3 竖版会切掉大半画面；
   *   把 l/m 都留给第 7 步，由「清晰度 + 构图损失」评分选出最好的一张，
   *   比在这里写死「优先 l」更稳。
   *
   * ★ 为什么过滤 nophoto：占位图（nophoto_stage.png）不是真海报，
   *   它会让「没有海报」的作品看起来有图，掩盖缺图问题。
   */
  data.posterAll = corichPosterAll(html);
  data.posterMain = data.posterAll[0] ?? null;

  /*
   * 售票平台（侧栏「チケット取扱い」）。
   *
   * ★ 为什么在这一层顺手抓、不另开一趟：它与作品数据同页，
   *   而 get() 有会话缓存 —— 等于零成本。另起一趟要再走一遍全部总页。
   */
  data.ticketChannels = corichTicketChannels(html);

  return data;
}

/** 单会場页 → 该档的精确起止与场次数 */
function parseStagePage(html) {
  // ★ 注意：这里用 matchAll 取**整段**匹配，不能只取 first() 的第一个捕获组 ——
  //   两个日期都是 (\d{4}\/\d{2}\/\d{2})，first() 只会返回第一个（开演日）。
  const period = html.match(
    /(\d{4}\/\d{2}\/\d{2}) \(.\) ～ (\d{4}\/\d{2}\/\d{2}) \(.\)\s*<\/td>/,
  );
  const rows = [...html.matchAll(/<tr>\s*<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g)];
  const cell = (name) => {
    for (const r of rows) {
      if (textOf(r[1]) === name) return textOf(r[2]);
    }
    return '';
  };
  const title = textOf(first(/<h1 class="name">([\s\S]*?)<\/h1>/, html) ?? '');
  const theaterId = first(/<p class="theater"><a href="\/theater\/(\d+)">/, html);
  const theaterName = textOf(first(/<p class="theater"><a href="\/theater\/\d+">([\s\S]*?)<\/a>/, html) ?? '');
  const pref = textOf(first(/<span class="pref">（([\s\S]*?)）/, html) ?? '');

  // 场次数：タイムテーブル 里「M月D日（X）」的出现次数
  const tt = cell('タイムテーブル');
  const perfCount = tt ? (tt.match(/\d{1,2}月\d{1,2}日/g) ?? []).length : 0;

  return {
    title,
    theaterId,
    theaterName,
    pref,
    start: period ? period[1].replace(/\//g, '-') : null,
    end: period ? period[2].replace(/\//g, '-') : null,
    performances: perfCount > 0 ? perfCount : null,
  };
}

// ────────────────────────────────────────────────────────────
// 会場
// ────────────────────────────────────────────────────────────

/** 罗马字 slug（用于会場 id） */
/**
 * 会場名 → slug（**仅在没有 theaterId 时用**，见下方「会場 id」注释）
 *
 * ★ 为什么纯日文名字不能只靠 slugify：
 *   「メガネのイタガキ文化ホール伊勢崎」里没有一个 a-z0-9，
 *   slugify 之后是空串 —— 于是所有纯日文的会場都变成同一个 `venue`
 *   （或 `venue-x`），彼此撞名。实测 5 个会場中招，
 *   表现是「巡演的第三站和第五站指向同一个会場页」。
 *
 *   所以给纯日文名字加一段**稳定的哈希后缀**：
 *   名字相同 → 后缀相同（同一会場仍会合并），
 *   名字不同 → 后缀不同（不会撞名）。
 */
function slugifyVenue(ja, en) {
  const src = en && /^[A-Za-z0-9 .\-&'()]+$/.test(en) ? en : ja;
  const base = src
    .toLowerCase()
    .replace(/[（）()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base) return base;
  // 纯非拉丁字符：用名字的短哈希保证唯一且稳定
  return 'v-' + crypto.createHash('sha1').update(ja).digest('hex').slice(0, 8);
}

/**
 * 从会場名反推都道府県（协会站只给会場名时用）
 *
 * ★ 为什么需要它：协会站的「公演期間 / 劇場」一栏只有会場名，
 *   没有都道府県。而本站的会場页要显示所在地、筛选要按城市聚合。
 *
 * ★ 为什么只覆盖**会場名里带地名的**那部分（如「東京建物 Brillia HALL 箕面」）：
 *   大部分会場名不含地名（「Kanadevia Hall」「シアターH」），
 *   瞎猜会把「東京」安到所有会場头上 —— 那比留空更糟：
 *   用户看到「所在地：東京都」会当真，而它其实是错的。
 *   推不出来就留空，页面还有会場名这个主信息。
 */
function guessPref(venueName) {
  if (!venueName) return '';
  const prefs = [
    '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
    '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
    '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
    '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
    '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
    '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
    '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
  ];
  for (const p of prefs) {
    if (venueName.includes(p)) return p;
  }
  // 「〇〇市」这类也常见（如箕面市立文化芸能劇場）→ 退而求其次用市名匹配
  const cityToPref = {
    東京: '東京都', 大阪: '大阪府', 京都: '京都府', 名古屋: '愛知県',
    横浜: '神奈川県', 神戸: '兵庫県', 札幌: '北海道', 仙台: '宮城県',
    広島: '広島県', 福岡: '福岡県', 箕面: '大阪府', 豊橋: '愛知県',
    品川: '東京都', 渋谷: '東京都', 新宿: '東京都',
  };
  for (const [c, p] of Object.entries(cityToPref)) {
    if (venueName.includes(c)) return p;
  }
  return '';
}

/** 会場名 → 中文（译名表 + 通用后缀） */
function venueZh(ja) {
  const map = {
    帝国劇場: '帝國劇場',
    'シアタークリエ': '劇場 Creation',
    日生劇場: '日生劇場',
    明治座: '明治座',
    新橋演舞場: '新橋演舞場',
    赤坂ACTシアター: '赤坂ACT劇場',
    東京国際フォーラム: '東京國際論壇',
    'TOKYO DOME CITY HALL': 'TOKYO DOME CITY HALL',
    東京ドーム: '東京巨蛋',
    日本武道館: '日本武道館',
    国立劇場: '國立劇場',
    'Bunkamuraオーチャードホール': 'Bunkamura 果園音樂廳',
    大手町三井ホール: '大手町三井音樂廳',
    神戸文化ホール: '神戶文化會館',
    松山市民会館: '松山市民會館',
    市民会館: '市民會館',
    文化会館: '文化會館',
    芸術劇場: '藝術劇場',
    芸術文化センター: '藝術文化中心',
    総合文化センター: '綜合文化中心',
    県民ホール: '縣民音樂廳',
    市民ホール: '市民音樂廳',
    国際会議場: '國際會議場',
    コンサートホール: '音樂廳',
    大ホール: '大音樂廳',
    中ホール: '中音樂廳',
    小ホール: '小音樂廳',
    シアター: '劇場',
    ホール: '音樂廳',
    劇場: '劇場',
    会館: '會館',
    センター: '中心',
    東京: '東京',
    大阪: '大阪',
    京都: '京都',
    名古屋: '名古屋',
    福岡: '福岡',
    札幌: '札幌',
    仙台: '仙台',
    広島: '廣島',
    横浜: '橫濱',
    神戸: '神戶',
    埼玉: '埼玉',
    千葉: '千葉',
    静岡: '靜岡',
    沖縄: '沖繩',
  };
  let out = ja;
  // 长键优先，避免「市民会館」先把「文化会館」里的片段吃掉
  for (const k of Object.keys(map).sort((a, b) => b.length - a.length)) {
    out = out.split(k).join(map[k]);
  }
  return out;
}

/** 会場页 → 地址 / 座席数 */
function parseTheaterPage(html) {
  const name = textOf(first(/<h1 class="name">[\s\S]*?劇場<\/span>\s*([\s\S]*?)<\/h1>/, html) ?? '');
  const info = first(/<div class="info">([\s\S]*?)<\/div>/, html) ?? '';
  const zip = first(/〒(\d{7})/, info);
  const seats = first(/座席数：(\d+)席/, info);
  const addr = textOf(
    info
      .replace(/〒\d{7}/, '')
      .replace(/座席数：\d+席/, '')
      .replace(/【アクセス】[\s\S]*/, '')
      .replace(/https?:\/\/\S+/, '')
      .replace(/※[^\n]*/g, ''),
  )
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    name,
    zip,
    seats: seats ? +seats : null,
    address: addr.find((s) => /[都道府県]/.test(s)) ?? addr[0] ?? '',
    tel: addr.find((s) => /^0\d/.test(s)) ?? null,
  };
}

// ────────────────────────────────────────────────────────────
// 数据源 ②：日本2.5次元ミュージカル協会（j25musical.jp）
// ────────────────────────────────────────────────────────────

/*
 * ★★ 为什么要有第二个源 ★★
 *
 *   CoRich 是用户共建库，两个硬伤补不了：
 *     ①「2.5次元舞台」分类只标了 62 条（实测协会站有它没标的新作）；
 *     ② 档期与会場是剧团自己登记的，滞后于官方公告。
 *
 *   协会站（一般社団法人 日本2.5次元ミュージカル協会）是**行业官方组织**，
 *   它的 SHOW SCHEDULE 就是「现在演什么、接下来演什么」的权威答案，
 *   而且带 CoRich 没有的独家条目（怪物事変、多聞くん今どっち！？、
 *   ケロロ軍曹 等 —— 实测 9 部里有 6 部 CoRich 分类里没有）。
 *
 * ★ 但它只能当**优先源**，不能取代 CoRich：
 *   协会站没有归档与分页，只列当期与未来已公布的作品。
 *   所以历史内容仍要靠 CoRich（那边有 311 部）。
 *
 * ★★ 两个列表页，都要抓（实测差一倍）★★
 *   /schedule/         SHOW SCHEDULE —— 只列**近期**的 12 部；
 *   /stage/            公演ラインアップ —— 列**当期 + 未来已公布**的 33 部。
 *   初版只抓了 /schedule/，于是「已公布但还没开演」的作品
 *   （薄桜鬼 真改、真剣乱舞祭2026、DEATH NOTE 等 17 部）全部漏掉 ——
 *   而本站的「即將開演」页恰恰最需要它们。
 *   两个页面的 /stage/<id> 是同一套 ID，按 ID 去重即可。
 *
 * ★ 合并规则：以作品标题为键，协会站覆盖 CoRich。
 *   为什么不用 ID 做键：两个源的 ID 体系完全不同，无法互相对照；
 *   而作品名是两边都有的、人类可读的唯一标识。
 *   「协会站优先」是因为它是官方数据 —— 同一部作品两边档期冲突时，
 *   应该信官方。
 */

const J25_BASE = 'https://www.j25musical.jp';

/** 协会站日程页（/schedule/）→ [{ id, title, dateText }] */
function parseJ25Schedule(html) {
  const out = [];
  const re =
    /<a class="title__link" href="\/stage\/(\d+)">([^<]+)<\/a>\s*<br>\s*<span class="title__date ofonts">([\s\S]*?)<\/span>/g;
  for (const m of html.matchAll(re)) {
    out.push({
      j25Id: m[1],
      title: textOf(m[2]),
      dateText: textOf(m[3]).replace(/\s+/g, ' '),
    });
  }
  return out;
}

/**
 * 协会站「公演ラインアップ」页（/stage/）→ [{ id, title, dateText }]
 *
 * ★ 它的结构与 /schedule/ 不同（这里是卡片列表，不是表格）：
 *     <a href="/stage/1148"> … <h3 class="show-title">作品名</h3> …
 *     <p class="show-date ofonts">2026-09-07 - 2026-10-25</p>
 *   日期是 ISO 形式，未定结束日的写成「2026-04-04 ～」。
 *
 * ★ 这里抓到的日期**只用于显示与粗筛**，真正的档期仍以详情页
 *   「公演期間 / 劇場」那一栏为准（它才是逐会場的）。
 */
function parseJ25Lineup(html) {
  const out = [];
  const re =
    /<a href="\/stage\/(\d+)"[\s\S]{0,1200}?<h3 class="show-title">([\s\S]*?)<\/h3>[\s\S]{0,400}?<p class="show-date ofonts">([\s\S]*?)<\/p>/g;
  for (const m of html.matchAll(re)) {
    out.push({
      j25Id: m[1],
      title: textOf(m[2]),
      dateText: textOf(m[3]).replace(/\s+/g, ' '),
    });
  }
  return out;
}

/**
 * 协会站详情页 → 一部作品的完整数据
 *
 * ★ 它的「公演期間 / 劇場」一栏就是**多档巡演**，形如：
 *     【東京公演】2026年9月7日(月)～9月13日(日) Kanadevia Hall
 *     【大阪公演】2026年9月20日(日)～9月27日(日) 東京建物 Brillia HALL 箕面 大ホール
 *   这与本站 Show.runs 的结构天然对应，一行一档，无需像 CoRich 那样
 *   爬回作品总页再合并。
 *
 * ★ 日期解析为什么必须**补年份**：
 *   协会站写的是「2026年9月7日(月)～9月13日(日)」——
 *   结束日只写月日，年份要沿用开始日的年份。
 *   直接把「9月13日」当完整日期会得到 1970 之类的错值，
 *   而 validate 只查格式（YYYY-MM-DD），查不出「年份错了」。
 */
function parseJ25Detail(html, j25Id) {
  const title =
    textOf(first(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/, html) ?? '') ||
    textOf(first(/<title>([\s\S]*?)<\/title>/, html) ?? '').split('|')[0].trim();
  if (!title) return null;

  // 官方站
  const officialUrl =
    first(/<a href="(https?:\/\/[^"]+)"[^>]*class="[^"]*"[^>]*>\s*<span><i class="blank"><\/i>OFFICIAL SITE/, html) ??
    first(/href="(https?:\/\/[^"]+)"[^>]*>[\s\S]{0,80}?OFFICIAL SITE/, html);

  // 主催
  const company = textOf(first(/<h3>主催\s*&nbsp;<\/h3>\s*<p>([\s\S]*?)<\/p>/, html) ?? '');

  // 海报
  let poster = first(/<img[^>]+src="(\/showCtsImage\.php\?[^"]+)"/, html);
  if (poster) poster = J25_BASE + poster.replace(/&amp;/g, '&');

  // 多档巡演
  const runs = [];
  const block = first(/<h3>公演期間 \/ 劇場\s*&nbsp;<\/h3>\s*<p>([\s\S]*?)<\/p>/, html) ?? '';
  for (const line of block.split(/<br\s*\/?>/)) {
    const t = textOf(line);
    if (!t || t.startsWith('※')) continue;
    /*
     * 形如：【東京公演】2026年9月7日(月)～9月13日(日) Kanadevia Hall
     *        【東京公演】2026-04-04 ～  美少女戦士…（有些条目没有结束日）
     */
    /*
     * 会場名的清洗：源站这一行的写法是
     *   【東京公演】2026年9月7日(月)～9月13日(日) Kanadevia Hall
     * 所以「日期之后剩下的部分」里还带着
     *   ① 公演名前缀 【東京公演】
     *   ② 星期的残留 (日)
     *   ③ 末尾的备注（※プレビュー公演含む 之类）
     * 不清掉的话会場名会变成「【東京公演】(日) Kanadevia Hall」——
     *   而它会进 venues.json 并被显示在日程表与筛选里。
     */
    const cleanVenue = (s) =>
      s
        .replace(/^【[^】]*】\s*/, '') // 【東京公演】
        .replace(/^[(（][^)）]*[)）]\s*/, '') // (日)
        .replace(/^[～〜]\s*/, '') // 只有開演日的公演：2026年4月4日(土)～ 会場
        .split('※')[0]
        .trim();

    const pad = (v) => String(v).padStart(2, '0');
    const datePattern = /(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*[（(][^）)]*[）)])?/;
    const range = t.match(
      /(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*[（(][^）)]*[）)])?\s*～\s*(?:(\d{4})年)?\s*(\d{1,2})月(\d{1,2})日(?:\s*[（(][^）)]*[）)])?/,
    );

    if (range) {
      const y = range[1];
      const start = `${y}-${pad(range[2])}-${pad(range[3])}`;
      // 終了日可能跨年；省略年份時，結束月份小於開始月份即視為次年。
      let endYear = range[4] || y;
      if (!range[4] && +range[5] < +range[2]) endYear = String(+y + 1);
      const end = `${endYear}-${pad(range[5])}-${pad(range[6])}`;
      const venueName = cleanVenue(t.replace(range[0], ''));
      if (venueName) runs.push({ venueName, start, end });
    } else {
      const date = t.match(datePattern);
      if (date) {
        const start = `${date[1]}-${pad(date[2])}-${pad(date[3])}`;
        const tail = t.slice(date.index + date[0].length);
        const openEnded = /^\s*～/.test(tail);
        // 未公布结束日时，不人为加 90 天；只有明确的其他来源档期才能扩展这个日期。
        const end = start;
        const venueName = cleanVenue(t.replace(date[0], '').replace(/^\s*～\s*/, ''));
        if (venueName) {
          runs.push({ venueName, start, end, ...(openEnded ? { openEnded: true } : {}) });
        } else {
          // 未標會場的單日活動沿用前一檔會場（例如同一場館的追加活動）。
          const previous = runs.at(-1);
          if (previous) runs.push({ venueName: previous.venueName, start, end });
        }
      } else {
        // ISO 日期只出現在未標結束日的長期公演資料。
        const iso = t.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (iso) {
          const start = `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`;
          const venueName = cleanVenue(t.replace(iso[0], '').replace(/^\s*[～〜]\s*/, ''));
          runs.push({ venueName: venueName || '（会場未記載）', start, end: start, openEnded: true });
        }
      }
    }
  }

  if (!runs.length) return null;

  // kind：标题里带ミュージカル → musical
  const kind = /ミュージカル|MUSICAL/i.test(title) ? 'musical' : 'stage';

  return {
    j25Id,
    title,
    officialUrl: officialUrl || null,
    company,
    poster,
    runs,
    kind,
    source: 'j25',
    ticketChannels: j25TicketChannels(html),
    sourceUrl: J25_BASE + '/stage/' + j25Id,
  };
}

/**
 * 抓协会站：两个列表页 → 每部作品的详情页
 *
 * ★ 两个列表页都要抓，按 j25Id 去重：
 *   /schedule/ 只列近期（12 部），/stage/ 列当期 + 未来已公布（33 部）。
 *   只抓前者会把「已公布但还没开演」的作品整批漏掉。
 *   任一页失败时另一页照常跑 —— 少一页只是少一部分作品，
 *   总比整源返回空要好。
 */
async function fetchJ25() {
  const lists = [];
  for (const [path, parse, label] of [
    ['/schedule/', parseJ25Schedule, '日程页'],
    ['/stage/', parseJ25Lineup, '公演ラインアップ'],
  ]) {
    try {
      // ★ 用**日文版**页面：作品名是原始日文（英文版是译名，
      //   拿译名去查译名表会查不到）。
      const html = await get(J25_BASE + path);
      const parsed = parse(html);
      console.log(`  协会站${label} ${parsed.length} 部`);
      lists.push(...parsed);
    } catch (e) {
      console.warn(`  协会站${label}失败：${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  // 按 j25Id 去重：两个页重叠的部分以先抓到的为准（/schedule/ 在前）
  const byId = new Map();
  for (const item of lists) if (!byId.has(item.j25Id)) byId.set(item.j25Id, item);
  const items = [...byId.values()];
  console.log(`  协会站合计 ${items.length} 部（去重后）`);
  if (!items.length) return [];

  const out = [];
  for (const it of items) {
    try {
      await sleep(DELAY_MS);
      const html = await get(J25_BASE + '/stage/' + it.j25Id);
      const d = parseJ25Detail(html, it.j25Id);
      if (d) {
        out.push(d);
        console.log(`    · ${d.title.slice(0, 34)} —— ${d.runs.length} 档`);
      } else {
        console.warn(`    ! /stage/${it.j25Id} 解析失败（${it.title.slice(0, 24)}）`);
      }
    } catch (e) {
      console.warn(`    ! /stage/${it.j25Id} 失败：${e.message}`);
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────────────────────

/** 抓「2.5次元舞台」分类的全部条目 */
async function fetchCategory() {
  const all = [];
  const seen = new Set();
  for (let page = 1; page <= 10; page++) {
    const url =
      'https://stage.corich.jp/stage/search?utf8=%E2%9C%93&search=1&category_id=7&sort=start_desc&page=' +
      page;
    const html = await get(url);
    const rows = parseSearchPage(html);
    for (const r of rows) {
      if (!seen.has(r.stageId)) {
        seen.add(r.stageId);
        all.push(r);
      }
    }
    const hit = parseHitCount(html);
    console.log(`  分类页 ${page}：${rows.length} 条（累计 ${all.length}）`);
    if (!hit || all.length >= hit.total || rows.length === 0) break;
    await sleep(DELAY_MS);
  }
  return all;
}

/**
 * 关键字补抓：分类标不到、但确实是 2.5 次元的作品
 *
 * ★★ 为什么必须**翻完所有页**（实测踩到的最大一个漏项）★★
 *   初版只取每个关键字的第 1 页（20 条）。而实测：
 *     「テニスの王子様」213 条   → 只取到 20
 *     「ミュージカル『刀剣乱舞』」66 条 → 只取到 20
 *     「プリキュア」91 条        → 只取到 20
 *   于是站上只有 13 部作品，而 CoRich 上实际有 **311 部**
 *   （912 个单会場条目）。这个漏项比「分类标注不全」严重得多 ——
 *   光修分类是修不出来的。
 *
 * ★ 为什么用 `freeword_type=title`（只搜标题）而不是搜全部：
 *   「全部」会把「出演者名字里含有该 IP 名」的无关公演也捞进来
 *   （实测「刀剣乱舞」搜全部得到 178 条，其中大量是剧团的普通公演）。
 *   只搜标题得到的才是「作品名里带这个 IP」的公演；本地过滤不区分
 *   英文字母大小写，避免 Fate 漏掉 2FATE 这类标题。
 */
async function fetchByKeywords(keywords) {
  const all = [];
  const seen = new Set();
  for (const kw of keywords) {
    let kwTotal = null;
    let kwGot = 0;
    let kwNew = 0;
    for (let page = 1; page <= 30; page++) {
      const url =
        'https://stage.corich.jp/stage/search?utf8=%E2%9C%93&search=1&freeword=' +
        encodeURIComponent(kw) +
        '&freeword_type=title&sort=start_desc&page=' +
        page;
      let html;
      try {
        html = await get(url);
      } catch (e) {
        console.warn(`  关键字「${kw}」第 ${page} 页失败：${e.message}`);
        break;
      }
      const keywordLower = kw.toLowerCase();
      const rows = parseSearchPage(html).filter((r) => r.title.toLowerCase().includes(keywordLower));
      for (const r of rows) {
        if (!seen.has(r.stageId)) {
          seen.add(r.stageId);
          all.push(r);
          kwNew++;
        }
      }
      kwGot += rows.length;
      const hit = parseHitCount(html);
      if (hit) kwTotal = hit.total;
      // 翻够了 / 这一页是空的 / 拿不到总数 → 停
      if (!hit || rows.length === 0 || kwGot >= kwTotal) break;
      await sleep(DELAY_MS);
    }
    console.log(`  关键字「${kw}」：${kwGot} 条（新增 ${kwNew}）`);
    await sleep(DELAY_MS);
  }
  return all;
}

async function main() {
  if (VALIDATE_ONLY) {
    const data = readData();
    const { errors, warnings } = validate(data);
    report(data, errors, warnings);
    return;
  }

  /*
   * --posters-only：只重跑海报，不重抓公演数据。
   *
   * ★ 为什么需要它：全量抓取会重建整份 dataset（时间窗一变，
   *   新增/剔除一批作品，还带上翻译与归并）—— 只想修几张糊图时，
   *   那是不必要的副作用。这条路径从现有 shows.json 出发，
   *   只动 public/posters/ 与 shows.json 里的 poster / accent 字段。
   */
  if (POSTERS_ONLY) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.mkdirSync(POSTER_DIR, { recursive: true });
    const data = readData();
    const sharp = (await import('sharp')).default;
    console.log('\n[海报] 从现有 data/shows.json 重建图源候选 …');
    for (const s of data.shows) s.posterCandidates = await candidatesFromSource(s);
    await refreshPosters(data.shows, sharp);
    for (const s of data.shows) delete s.posterCandidates;
    writeJson('shows.json', data.shows);
    const { errors, warnings } = validate(data);
    report(data, errors, warnings);
    return;
  }

  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(POSTER_DIR, { recursive: true });

  const WINDOW_DAYS = Number(process.env.SCRAPE_WINDOW_DAYS || 365);

  console.log('\n[1/8] 抓取协会站（官方优先源）…');
  const j25Works = await fetchJ25();

  console.log('\n[2/8] 抓取 CoRich「2.5次元舞台」分类 …');
  const byCategory = await fetchCategory();
  console.log(`  分类共 ${byCategory.length} 条（含同一作品的多个会場）`);

  console.log('\n[3/8] CoRich 关键字补抓 …');
  /*
   * ★★ 为什么关键字列表要**全部用译名表的键** ★★
   *   初版只写了 7 个热门 IP。而实测：CoRich 的「2.5次元舞台」
   *   分类只标了 62 条，大量作品要靠关键字才能捞出来 ——
   *   全部关键字翻完能拿到 912 个单会場条目 / **311 部作品**。
   *   只搜 7 个等于主动放弃大半内容，这正是「站上作品不全」的主因。
   *
   *   译名表的键本来就是「本站认可的 2.5 次元 IP 清单」，
   *   拿它当关键字列表，两件事共用同一份数据，不会各自漂移。
   */
  const KEYWORDS = Object.keys(zhNames.series);
  const byKeyword = await fetchByKeywords(KEYWORDS);

  // 合并：以 stageId 为键（它们是「单会場」条目，后面会爬回 stage_main）
  const stages = new Map();
  for (const r of [...byCategory, ...byKeyword]) stages.set(r.stageId, r);
  console.log(`\n  待解析的单会場条目：${stages.size}`);

  /*
   * ── 详情页抓取前的粗筛 ─────────────────────────────────
   *
   * ★ 为什么要在这一步先筛：
   *   关键字补抓会捞出**大量历史条目**（实测 813 个单会場），
   *   而其中九成以上在时间窗之外。全抓一遍要几百次请求，
   *   而且每次网络抖动都要重试三次（每次 10s 连接超时）——
   *   实测能把一轮抓取拖到一个多小时，且失败率随时间升高。
   *
   * ★ 为什么留 180 天余量：
   *   搜索页的档期是「这一个会場」的，而时间窗判定用的是
   *   「这部作品最晚的一场」。长期公演里较早的会場会先被误筛掉。
   *   留余量后，只有「结束日比时间窗还早半年」的会場才会被跳过 ——
   *   这种会場所属的作品必然也整部在窗外。
   *
   * ★ 这不是判定，只是省请求：
   *   精确的时间窗过滤仍在第 5 步照常执行，判定规则没变。
   */
  if (!KEEP_ALL) {
    const roughCutoff = new Date(Date.now() + 9 * 3600_000 - (WINDOW_DAYS + 180) * 86400_000)
      .toISOString()
      .slice(0, 10);
    let skipped = 0;
    for (const [stageId, row] of stages) {
      if (row.end && row.end < roughCutoff) {
        stages.delete(stageId);
        skipped++;
      }
    }
    if (skipped) {
      console.log(
        `  粗筛：${skipped} 个单会場早于 ${roughCutoff}（时间窗 ${WINDOW_DAYS} 天 + 180 天余量），跳过详情页抓取`,
      );
    }
  }

  console.log('\n[4/8] 抓详情页并归并为作品 …');
  const works = new Map(); // stage_main_id → work
  let done = 0;
  for (const [stageId, row] of stages) {
    done++;
    let stageHtml;
    try {
      stageHtml = await get('https://stage.corich.jp/stage/' + stageId);
    } catch (e) {
      console.warn(`    ! /stage/${stageId} 失败：${e.message}`);
      continue;
    }
    const mainId = first(/var stage_main_id = '(\d+)'/, stageHtml);
    const st = parseStagePage(stageHtml);

    let work = works.get(mainId ?? 'single-' + stageId);
    if (!work) {
      // 先取总页（有全部巡演会場）；单会場作品总页就是它自己
      let mainHtml = stageHtml;
      if (mainId) {
        try {
          await sleep(DELAY_MS);
          mainHtml = await get('https://stage.corich.jp/stage_main/' + mainId);
        } catch {
          mainHtml = stageHtml; // 总页抓不到就退回单会場页
        }
      }
      const parsed = parseMainPage(mainHtml, mainId);
      if (!parsed) continue;
      work = { ...parsed, runs: [], posters: [], firstStageId: stageId };
      works.set(mainId ?? 'single-' + stageId, work);
      if (parsed.posterAll) work.posters.push(...parsed.posterAll);
      await sleep(DELAY_MS);
    }

    // 这一档的精确日期：优先用单会場页（它才是「这一場」的档期）
    if (st.start && st.end) {
      work.runs.push({
        stageId,
        venueName: st.theaterName || row.theater,
        venueJaFromSelect: null,
        pref: st.pref || row.pref,
        theaterId: st.theaterId,
        start: st.start,
        end: st.end,
        performances: st.performances,
      });
    }
    if (done % 10 === 0) console.log(`    ${done}/${stages.size} → 已归并 ${works.size} 部作品`);
  }

  /*
   * 用总页的 select 补全会場名（它带都道府県，且是官方登记的写法）
   */
  for (const w of works.values()) {
    if (!w.venues?.length) continue;
    const byId = new Map(w.venues.map((v) => [v.stageId, v]));
    for (const r of w.runs) {
      const v = byId.get(r.stageId);
      if (v) {
        r.venueName = v.name;
        r.pref = v.pref;
      }
    }
  }

  /*
   * ── 补全缺失的 theaterId ──────────────────────────────────
   *
   * ★★ 为什么需要这一步（实测踩到的坑）★★
   *   会場 id 以 CoRich 的 theaterId 为准（见下方「会場 id」注释）。
   *   但 theaterId **只出现在单会場页** `/stage/<id>` 的会場链接里，
   *   而作品总页的那个 select 只有 stageId 与会場名。
   *
   *   于是：巡演里「没被搜索命中」的会場（例如第 3、第 7 站）
   *   永远拿不到 theaterId —— 走名字兜底，而 slugify 遇到
   *   纯日文会場名会把字符全滤掉，得到 `venue-x`、`j-com-x` 这种
   *   既不可读、还可能撞名的 id。实测 58 个会場里有 5 个中招。
   *
   *   修法：select 里每个 option 都带 stageId，用它去抓一次
   *   单会場页就能拿到 theaterId。这一步只对**缺 id 的档期**做，
   *   所以通常只多几个请求。
   *
   * ★ 实测结论：这批会場在 CoRich 上**压根没登记** theaterId ——
   *   单会場页上的会場名是纯文本，不带 /theater/<id> 链接
   *   （抽样 52 个单会場页：37 个带链接、15 个不带）。
   *   所以「补抓成功 0」是**源站如此**，不是解析失败 ——
   *   这段代码仍需保留：它救的是「有链接但恰好没被搜索遍历到」的会場。
   *
   * ★ 为什么失败时**保留**兜底 id 而不是跳过这一档：
   *   这一档是真的公演。拿不到 id 只是 id 难看，
   *   丢掉它会让「这一站」从日程里消失 —— 那是错的数据。
   */
  let idFixed = 0;
  let idFailed = 0;
  for (const w of works.values()) {
    for (const r of w.runs) {
      if (r.theaterId) continue;
      if (r.stageId == null) continue;
      try {
        const html = await get('https://stage.corich.jp/stage/' + r.stageId);
        const tid = first(/<p class="theater"><a href="\/theater\/(\d+)">/, html);
        if (tid) {
          r.theaterId = tid;
          idFixed++;
        } else {
          idFailed++; 
        }
      } catch {
        idFailed++;
      }
      await sleep(DELAY_MS * 0.6);
    }
  }
  if (idFixed || idFailed) {
    console.log(`\n  会場 id 补全成功 ${idFixed}；仍缺 ${idFailed} 个（源站未登记 theaterId，改用会場名哈希当 id）`);
  }

  /*
   * ── 时间窗过滤 ──────────────────────────────────────────
   *
   * ★★ 为什么要过滤：CoRich 的分类页是「全部历史条目」 ★★
   *   按 start_desc 翻完「2.5次元舞台」分类得到 62 条，归并后是
   *   54 部作品 —— 但其中 **47 部已经结束**（最早到 2018 年）。
   *   而本站的名字就叫「上演中 / 即將開演」，首页与列表页的主体
   *   是「现在能看的」。一个 47/54 都是历史档案的站，
   *   对用户是「点进去发现全都不能买票」—— 那比内容少更糟。
   *
   * ★ 为什么保留**近期结束**的而不是只留未结束的：
   *   只留 now/upcoming 的话此刻只有 11 部（实测），列表页几乎是空的。
   *   而刚结束的公演仍有价值（用户会搜「刚演完的那部」），
   *   且它们在页面上有明确的「已結束」标记，不会误导。
   *
   * ★ 为什么窗口是 **365 天**（原为 180 天）：
   *   半年窗下只剩 13 部，用户反映「舞台剧不全」。而放宽到一年
   *   能覆盖一整轮演出季（2.5 次元的热门 IP 常隔年再演，
   *   一年内基本能兜住同一批 IP 的现役档期），实测约 27 部。
   *   再放宽（三年、全部）会让历史档案占多数，
   *   而本站的主体是「现在能看的」—— 那才是最需要守住的。
   *
   * ★ 注意协会站的作品**不受此窗口限制**：
   *   协会站只列当期与未来已公布（正在演 / 即将开演），本来就不含历史，
   *   再套一次窗口没有意义，还可能误删（例如长期公演）。
   *   实现上它们是在本过滤**之后**才合并进来的。
   */
  const TOTAL_SHOWS = works.size;
  if (!KEEP_ALL) {
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() + 9 * 3600_000 - WINDOW_DAYS * 86400_000)
      .toISOString()
      .slice(0, 10);
    let dropped = 0;
    for (const [k, w] of works) {
      if (!w.runs.length) {
        works.delete(k);
        dropped++;
        continue;
      }
      const end = w.runs.reduce((a, r) => (r.end > a ? r.end : a), w.runs[0].end);
      if (end < cutoff) {
        works.delete(k);
        dropped++;
      }
    }
    console.log(
      `\n  时间窗过滤：保留 ${works.size} 部（截至 ${today}，${WINDOW_DAYS} 天前结束的 ${dropped} 部已剔除）`,
    );
    console.log(`  （加 --keep-all 可保留全部 ${TOTAL_SHOWS} 部历史档案）`);
  }

  /*
   * ── 双源合并 ────────────────────────────────────────────
   *
   * ★ 为什么以**作品标题**为合并键：
   *   两个源的 ID 体系完全不同（CoRich 用 stage_main_id、
   *   协会站用 /stage/<id>），无法互相对照。而作品名两边都有，
   *   且是人类可读的唯一标识。
   *
   * ★ 为什么协会站**覆盖** CoRich：协会站是行业官方组织，
   *   同一部作品两边档期冲突时应信官方。CoRich 是用户共建，
   *   存在登记滞后。
   *
   * ★ 标题归一化：全角/半角、空格、「！」「!」这类差异
   *   会让同一部作品被当成两部。归一化后再比对。
   */
  const normTitle = (s) =>
    s
      /*
       * ★ 为什么要在全角转半角**之前**单独折叠 ︕﹗︖﹖：
       *   协会站部分标题用的是 U+FE15/FE16 这类直排标点，
       *   而 CoRich 用 U+FF01/U+FF1F。两者渲染出来一模一样，
       *   但码位不同 —— 不折叠的话「多聞くん今どっち︕︖」与
       *   「多聞くん今どっち！？」会被当成两部作品：
       *   协会站那条覆盖不掉 CoRich 的，站上出现重复，
       *   而且协会站那部永远没有出演者（它本来就不提供）。
       *   全角区间 ！-～（U+FF01–U+FF5E）不含这几个码位，所以必须单列。
       *
       * ★ 为什么还要去掉「ミュージカル / 舞台」前缀与引号、分隔符：
       *   同一个作品两边写法差很多 —— 协会站写
       *   「ミュージカル『PandoraHearts』RetraceⅡ-madness of lost memory-」，
       *   CoRich 写「『PandoraHearts』Retrace Ⅱ」+ 副标题「madness of lost memory」。
       *   不去掉这些差异，同一部作品就会在站上出现两次：
       *   协会站那条（没有出演者）和 CoRich 那条（有）并存。
       *   归一化后两者都是 pandoraheartsretraceⅱmadnessoflostmemory。
       *
       * ★ 注意这里只影响「协会站作品能否对上 CoRich 同名作品」，
       *   不会把 CoRich 内部两部作品合并（它们以 mainId 为键，天然分开）。
       */
      .replace(/[︕﹗]/g, '!')
      .replace(/[︖﹖]/g, '?')
      .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      /*
       * ★ 为什么去掉第一个引号之前的那段：
       *   协会站会在作品名前挂「企划名」，CoRich 不会 ——
       *     协会站：十周年記念特別公演 舞台『刀剣乱舞』陽伝 …
       *     CoRich：舞台『刀剣乱舞』陽伝 …
       *     协会站：HAPPEY MUSICAL「えぶりでいホスト」
       *     CoRich：えぶりでいホスト
       *   不去掉的话同一部作品会收录两次：协会站那条（没有出演者）
       *   和 CoRich 那条（有）并存，档期还完全一样。
       *   限定 24 字以内且中间不能有引号，避免把真正的作品名切掉。
       */
      .replace(/^[^『「“"]{1,24}[『「“"]/, '')
      .replace(/^(?:ミュージカル|舞台|劇団)/, '')
      .replace(/[『』「」（）()\[\]・·\-–—～〜]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase();

  const titleKeys = (work) =>
    [work.title, work.subtitle ? `${work.title}${work.subtitle}` : '']
      .filter(Boolean)
      .map(normTitle);
  const corichByTitle = new Map();
  for (const [k, w] of works) {
    for (const key of titleKeys(w)) corichByTitle.set(key, k);
  }

  const normVenue = (name) =>
    name.replace(/品川プリンスホテル/g, '').replace(/[\s　]+/g, '').replace(/eX/g, 'ex').toLowerCase();
  let j25Added = 0;
  let j25Overrode = 0;
  for (const j of j25Works) {
    const key = normTitle(j.title);
    const existingKey = corichByTitle.get(key);
    if (existingKey !== undefined) {
      const existing = works.get(existingKey);
      const runs = j.runs.map((run) => {
        if (!run.openEnded) return run;
        // 協會未列結束日的長期公演，保留 CoRich 同一場館、同一起日記錄的已登記檔期。
        const previous = existing.runs.find(
          (candidate) =>
            candidate.start === run.start && normVenue(candidate.venueName) === normVenue(run.venueName),
        );
        return previous && previous.end > run.end ? { ...run, end: previous.end } : run;
      });
      const titleIsSubtitleCombined =
        Boolean(existing.subtitle) && normTitle(`${existing.title}${existing.subtitle}`) === key;

      /*
       * 售票平台：协会站这一栏常常只有「お問い合わせ」窗口、拿不到平台，
       * 而 CoRich 同一部作品的侧栏是完整的 —— 所以协会站没有时**回落到
       * CoRich 那一份**。
       *
       * ★★ 为什么回落要加「档期有交集」的守卫 ★★
       *   合并键是归一化后的标题，而同一部作品会**隔年再演**
       *   （实测：协会站 2027 年的 NARUTO 舞台，标题与 CoRich 上
       *   2021 年那一版完全一致）。不加守卫就会把 2021 年的售票平台
       *   挂到 2027 年的公演上 —— 页面看起来完全正常，只是指向了错的票务。
       *   档期有交集才认，是同名不同版之间最便宜也最可靠的判据。
       */
      const ticketChannels = mergeTicketChannels([
        ...(j.ticketChannels ?? []),
        ...(runsOverlap(runs, existing.runs) ? (existing.ticketChannels ?? []) : []),
      ]);
      works.set(existingKey, {
        ...existing,
        ...j,
        // CoRich 有些作品把副標題獨立存放；J25 合併標題時保留原有主標題結構。
        title: titleIsSubtitleCombined ? existing.title : j.title,
        subtitle: existing.subtitle ?? j.subtitle,
        runs,
        ticketChannels,
        // CoRich 有而協會站沒有的欄位要保住（如 kind 的細分類別）
        kind: j.kind,
        _fromJ25: true,
      });
      j25Overrode++;
    } else {
      works.set('j25-' + j.j25Id, { ...j, _fromJ25: true });
      j25Added++;
    }
  }
  console.log(`\n  双源合并：协会站新增 ${j25Added} 部、覆盖 CoRich 同名作品 ${j25Overrode} 部`);

  console.log('\n[5/8] 生成中文文案 …');
  const seeded = seedTranslationMemory();
  if (seeded) console.log(`  翻译记忆：从上一版数据预热 ${seeded} 条（不消耗额度）`);
  const shows = [];
  const seriesMap = new Map();
  const venueMap = new Map();
  const untranslated = [];

  for (const w of works.values()) {
    if (!w.runs.length) continue;
    w.runs.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

    const jaTitle = w.title;

    /*
     * ★★ 中文标题 = 「译名表命中的作品名」 + 「原文保留的其余部分」 ★★
     *
     *   初版把整个标题丢给译名表，命中「呪術廻戦」就把
     *   「舞台「呪術廻戦」-懐玉・玉折-」整条换成「咒術迴戰」——
     *   于是列表里出现 6 条都叫「咒術迴戰」的公演，用户分不出哪一版。
     *   而副标题（「-懐玉・玉折-」「其ノ弐 絆」）恰恰是区分版本的关键。
     *
     *   所以这里只**替换命中的那一段**，其余原样保留：
     *     舞台「呪術廻戦」-懐玉・玉折-  →  舞台「咒術迴戰」-懐玉・玉折-
     *   日文汉字（懐玉・玉折、其ノ弐）中文读者看得懂，
     *   而它们没有权威译名 —— 保留原文比硬翻更诚实。
     */
    const hit = lookupZh(jaTitle);
    let zhTitle = null;
    let zhSubtitle = null;
    if (hit) {
      zhTitle = jaTitle.split(hit.matched).join(hit.zh);
      if (w.subtitle) zhSubtitle = w.subtitle;
    } else if (!NO_TRANSLATE) {
      // 未命中译名表：整条走机器翻译
      const t = await translateToZh(jaTitle);
      if (t) {
        zhTitle = t;
        if (w.subtitle) {
          const ts = await translateToZh(w.subtitle);
          zhSubtitle = ts ?? w.subtitle;
        }
        untranslated.push({ ja: jaTitle, zh: zhTitle });
      }
    }
    if (!zhTitle) {
      /*
       * ★ 翻译失败时回退日文原名，而不是留空：
       *   空字符串在中文模式下会渲染成空白，用户看不出是「没有中文名」
       *   还是「页面坏了」。日文原名至少是真实存在的名字。
       */
      zhTitle = jaTitle;
      if (w.subtitle) zhSubtitle = w.subtitle;
      untranslated.push({ ja: jaTitle, zh: null });
    }

    const ser = inferSeries(jaTitle);
    /*
     * ★ 系列 id 也用罗马字键，理由与 slug 相同：
     *   它会烘进 /series/<id>/index.html 的目录名。
     *   日文 id（/series/呪術廻戦/）在分享链接里会被编码成
     *   /series/%E5%91%AA%E8%A1%93%E5%BB%BB%E6%88%A6/ ——
     *   既不友好，也让 sitemap 里出现一长串百分号。
     */
    const seriesId = ser ? slugKey(romanOf(ser.key)) : fallbackSeriesId(jaTitle);
    if (!seriesMap.has(seriesId)) {
      seriesMap.set(seriesId, {
        id: seriesId,
        name: ser ? { zh: ser.name.zh, ja: ser.name.ja } : { zh: zhTitle, ja: jaTitle },
        original: {
          zh: `《${ser ? ser.name.zh : jaTitle}》`,
          ja: `『${ser ? ser.name.ja : jaTitle}』`,
        },
        sourceKind: ser?.kind ?? 'other',
      });
    }

    // 会場
    const venueIds = [];
    for (const r of w.runs) {
      /*
       * ★ 会場 id 为什么用「CoRich 的 theaterId」而不是会場名：
       *   会場名是日文（slug 化后 URL 不可读），而且同一个会場在站上
       *   常有几种写法（「松山市民会館」/「松山市民会館　大ホール」）,
       *   按名字做 key 会把同一会場拆成两个。theaterId 是源站主键，
       *   唯一且稳定。
       *
       * ★★ 没有 theaterId 时怎么办（实测踩到的坑）★★
       *   CoRich 有相当一部分会場**压根没登记** theaterId ——
       *   单会場页上的会場名是纯文本，不带 /theater/<id> 链接。
       *   实测 66 个会場里有 13 个如此，不是解析失败。
       *
       *   初版拼成「名字 slug + '-x'」，于是纯日文的会場名
       *   （slug 化后是空串）全部变成 `venue-x` 这种怪 id，
       *   而且多个不同会場会撞成同一个。
       *
       *   现在：优先 theaterId；拿不到就用**会場名的短哈希**
       *   （slugifyVenue 内已处理：有拉丁字符 → slug；纯日文 → sha1 前 8 位）。
       *   哈希保证「同名 → 同 id（仍会合并）、异名 → 异 id（不撞名）」，
       *   且**跨次抓取稳定** —— 这一点很关键：若 id 每次都变，
       *   /venue/<id>/ 的旧链接会全部失效，而它们可能已被收录。
       */
      // 協会站用酒店全名，CoRich 会場目录则用正式名和 theaterId；统一后复用同一会場。
      if (r.venueName === '品川プリンスホテル クラブ eX') r.venueName = 'クラブeX';
      const vid = r.theaterId ? 'v' + r.theaterId : r.venueName === 'クラブeX' ? 'v66' : slugifyVenue(r.venueName, r.venueName);
      /*
       * ★ 协会站的会場**没有 pref**（它的「公演期間/劇場」一栏只有会場名）。
       *   而本站的筛选与显示是按 pref / city 走的 —— 缺了它会場页的
       *   「所在地」是空的。所以从会場名里反推都道府県作兜底。
       *   推不出来就留空（页面已有「会場名」主信息，不会变成破图）。
       */
      const pref = r.pref || guessPref(r.venueName);
      /*
       * ★ city 的兜底：会場名若推不出都道府県（协会站大量如此 ——
       *   「Kanadevia Hall」「シアターH」这类名字里没有任何地名），
       *   city 就为空，而 validate 原本把它当**错误**阻断整轮抓取。
       *
       *   这个严厉程度不对：会場页上还有会場名这个主信息，
       *   city 只用于筛选聚合。为它阻断写入，等于让「一个会場
       *   查不到所在地」毁掉整站数据的更新。
       *
       *   所以这里用会場名兜底（页面显示的是会場名，不会变成空白），
       *   并把它降级为警告 —— 见 validate 里的对应注释。
       */
      const city = pref ? cityOf(pref) : r.venueName;
      if (!venueMap.has(vid)) {
        venueMap.set(vid, {
          id: vid,
          name: { zh: venueZh(r.venueName), ja: r.venueName },
          pref: pref ?? '',
          city: city || '',
          address: '',
          seats: null,
          theaterId: r.theaterId ?? null,
        });
      }
      if (!venueIds.includes(vid)) venueIds.push(vid);
      r.venueId = vid;
    }

    const start = w.runs[0].start;
    const end = w.runs.reduce((a, r) => (r.end > a ? r.end : a), w.runs[0].end);
    const zhSummary = w.description && !NO_TRANSLATE ? await translateToZh(w.description) : null;

    shows.push({
      /*
       * ★ slug 的 ID 部分两个源不同：CoRich 用 stage_main_id，
       *   协会站用 j25Id。两者都是源站主键，取其一即可 ——
       *   若写成固定用 mainId，协会站的作品会全部变成 '-undefined'。
       */
      slug: makeSlug(jaTitle, w.mainId ?? w.j25Id),
      title: { zh: zhTitle, ja: jaTitle },
      subtitle: w.subtitle ? { zh: zhSubtitle ?? w.subtitle, ja: w.subtitle } : undefined,
      seriesId,
      company: w._fromJ25 ? w.company || w.group || '' : w.group || w.company || '',
      kind: w.kind,
      startDate: start,
      endDate: end,
      runs: w.runs.map((r) => ({
        venueId: r.venueId,
        startDate: r.start,
        endDate: r.end,
        performances: r.performances,
      })),
      poster: null,
      /*
       * 海报候选（第 7 步按清晰度择优下载）。
       *
       * ★ 候选来自两个源：协会站（w.poster，单张）与 CoRich
       *   （w.posters，l/m）。合并后的作品两者都有 —— 谁清楚用谁，
       *   不再固定「协会站优先」：实测协会站上传的图有时本身就是糊的，
       *   而 CoRich 的 l 反而更清楚；固定优先级会把这种情况判死。
       *
       * ★ 协会站的图默认被缩过（w=&h= 返回 600×857），
       *   而显式要 2000×2000 会拿到原图（840×1200 / 1200×851）——
       *   清晰度实测提升 1.4~3 倍。所以协会站候选直接升级成大图 URL。
       */
      posterCandidates: [
        ...new Set([...(w.poster ? [j25PosterLarge(w.poster)] : []), ...(w.posters ?? [])]),
      ],
      /*
       * 主色：抓到海报后由 sharp 从图里取；抓不到时用兜底色。
       *
       * ★ 为什么不能写死一个色：示意海报（PosterArt）会按 accent 生成
       *   渐变底，详情页头部的主色氛围层也用它。若全部作品共用一个色，
       *   列表页就变成一整面同色卡片 —— 而 accent 的本职正是
       *   「在无海报时也能区分作品」。
       *
       * ★ 为什么是**抓完海报后回填**而不是在这里算：
       *   取色需要图片数据，而图片在第 6 步才下载。
       *   这里先放兜底色，第 6 步算出来后覆盖 —— 保证任何情况下
       *   accent 都是合法的 #RRGGBB（validate 会查格式）。
       */
      accent: DEFAULT_ACCENT,
      officialUrl: w.officialUrl || null,
      ticketUrl: null,
      ticketChannels: w.ticketChannels ?? [],
      cast: splitNames(w.castRaw),
      staff: parseStaff(w.staffRaw),
      summary: {
        zh: zhSummary ?? w.description,
        ja: w.description,
      },
      /*
       * ★ 来源标识必须**如实反映实际取到数据的那个源**：
       *   双源合并后，协会站覆盖过的作品虽然原本来自 CoRich，
       *   但它现在的档期/会場/官方站是协会站的 —— 标 corich 会让
       *   页脚的来源列表说谎（用户按它去核对会找错地方）。
       */
      source: w._fromJ25 ? 'j25' : 'corich',
      sourceUrl:
        w._fromJ25 && w.j25Id
          ? 'https://www.j25musical.jp/stage/' + w.j25Id
          : w.mainId
            ? 'https://stage.corich.jp/stage_main/' + w.mainId
            : 'https://stage.corich.jp/stage/' + w.firstStageId,
    });

    await sleep(120); // 翻译接口也限速
  }

  /*
   * 翻译结果汇总
   *
   * ★ 为什么这一块必须**说清原因**而不是只报数字：
   *   「有 N 条没翻成中文」这句话本身不构成行动依据。
   *   真实原因可能是：① 译名表没覆盖（→ 该去补表）；
   *   ② 免费额度用完（→ 明天重跑即可）；③ 网络失败（→ 重跑）。
   *   三种原因对应三种不同的下一步，混在一起报数字等于没报。
   */
  const failed = untranslated.filter((u) => !u.zh);
  console.log(`\n  中文标题：译名表/翻译命中 ${shows.length - failed.length} 部`);
  if (failed.length) {
    const why =
      TR_FAIL.quota > 0
        ? `翻译额度已用完（${TR_FAIL.quota} 次被拒）—— 属当日限额，隔天重跑即可`
        : `翻译失败 ${TR_FAIL.other} 次`;
    console.log(`  ⚠ ${failed.length} 部暂用日文原名：${why}`);
    for (const u of failed.slice(0, 15)) console.log(`    · ${u.ja}`);
    console.log('    → 建议：把它们的官方中文译名加进 data/zh-names.json');
  }
  if (TR_FAIL.quota > 0) console.log(`\n  ℹ 本次翻译请求被额度拒绝 ${TR_FAIL.quota} 次（MyMemory 每日限额）`);

  console.log('\n[6/8] 补会場详情（地址 / 座席数）…');
  await enrichVenues(venueMap);

  console.log('\n[7/8] 下载海报并取主色 …');
  if (NO_POSTERS) {
    console.log('  （--no-posters，跳过）');
  } else {
    const sharp = (await import('sharp')).default;
    await refreshPosters(shows, sharp);
  }

  console.log('\n[8/8] 校验并写入 …');
  for (const s of shows) delete s.posterCandidates;
  const supplements = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'summary-supplements.json'), 'utf8'));
  const supplemented = applySummarySupplements(shows, supplements);
  if (supplemented) console.log(`  已补充 ${supplemented} 部经来源核实的双语简介`);

  const series = [...seriesMap.values()];
  const venues = [...venueMap.values()];
  const { errors, warnings } = validate({ shows, series, venues });
  report({ shows, series, venues }, errors, warnings);
  if (errors.length) {
    console.error('\n✗ 校验未通过，未写入 data/*.json');
    process.exitCode = 1;
    return;
  }

  writeJson('shows.json', shows);
  writeJson('series.json', series);
  writeJson('venues.json', venues);
  console.log(
    `\n✓ 已写入 data/：${shows.length} 部公演 / ${series.length} 个系列 / ${venues.length} 个会場`,
  );
}

// ────────────────────────────────────────────────────────────
// 辅助
// ────────────────────────────────────────────────────────────

function slugKey(ja) {
  return (
    ja
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'series'
  );
}

function fallbackSeriesId(jaTitle) {
  return slugKey(jaTitle).slice(0, 40);
}

/**
 * slug 生成
 *
 * ★★ 为什么用「系列英文键 + 序号 + 源站 ID」，而不是日文标题 ★★
 *
 *   初版直接把日文标题 slug 化，得到的 URL 是
 *     /show/舞台-呪術廻戦-渋谷事変-前編-484152
 *   中文标题更糟（拼音/汉字混排，且不同作品 slug 化后可能撞名）。
 *   而 slug 会烘进**静态产物的目录名**，一旦上线就是 SEO 与分享链接的一部分 ——
 *   日文 slug 在微信/Twitter 里转码后极长且难读。
 *
 *   现在取「系列名的罗马字 + 该系列内第几部 + 源站 primary key」：
 *     咒術迴戰 第 1 部（mainId 484152）→ jujutsu-kaisen-1-484152
 *   既可读（英文键来自译名表，是稳定的），又恒唯一（带源站 ID）。
 */
function makeSlug(jaTitle, mainId) {
  const ser = inferSeries(jaTitle);
  const base = ser ? slugKey(romanOf(ser.key)) : slugKey(jaTitle).slice(0, 30);
  return `${base || 'show'}-${mainId ?? 'x'}`;
}

/** 日文键 → 罗马字（只覆盖译名表里出现过的键，够用且不引依赖） */
const ROMAN = {
  刀剣乱舞: 'touken-ranbu',
  '刀剣乱舞-ONLINE-': 'touken-ranbu',
  'テニスの王子様': 'tennis-no-oujisama',
  '新テニスの王子様': 'shin-tennis-no-oujisama',
  ハイキュー: 'haikyuu',
  'ハイキュー!!': 'haikyuu',
  呪術廻戦: 'jujutsu-kaisen',
  鬼滅の刃: 'kimetsu-no-yaiba',
  ヒプノシスマイク: 'hypnosis-mic',
  あんさんぶるスターズ: 'ensemble-stars',
  '東京卍リベンジャーズ': 'tokyo-revengers',
  アイドルマスター: 'idolmaster',
  ラブライブ: 'love-live',
  'ラブライブ!': 'love-live',
  BLEACH: 'bleach',
  NARUTO: 'naruto',
  'ONE PIECE': 'one-piece',
  ワンピース: 'one-piece',
  進撃の巨人: 'attack-on-titan',
  'SPY×FAMILY': 'spy-family',
  弱虫ペダル: 'yowamushi-pedal',
  キングダム: 'kingdom',
  名探偵コナン: 'conan',
  名探偵プリキュア: 'precure',
  プリキュア: 'precure',
  '青春-AOHARU-鉄道': 'aoharu-tetsudou',
  'TIGER & BUNNY': 'tiger-and-bunny',
  PandoraHearts: 'pandora-hearts',
  本好きの下剋上: 'honzuki-no-gekokujou',
  刀使ノ巫女: 'toji-no-miko',
  アイカツ: 'aikatsu',
  'ぼっち・ざ・ろっく': 'bocchi-the-rock',
  うる星やつら: 'urusei-yatsura',
  あの日見た花: 'anohana',
  僕のヒーローアカデミア: 'my-hero-academia',
  ヒロアカ: 'my-hero-academia',
  文豪ストレイドッグス: 'bungo-stray-dogs',
  黒執事: 'kuroshitsuji',
  ウマ娘: 'uma-musume',
  アズールレーン: 'azur-lane',
  'Fate/Grand Order': 'fgo',
  Fate: 'fate',
  ペルソナ: 'persona',
  逆転裁判: 'gyakuten-saiban',
  銀魂: 'gintama',
  斉木楠雄のΨ難: 'saiki-kusuo',
  るろうに剣心: 'rurouni-kenshin',
  'ハンター×ハンター': 'hunter-x-hunter',
  '幽☆遊☆白書': 'yuyu-hakusho',
  忍たま乱太郎: 'nintama-rantaro',
  美少女戦士セーラームーン: 'sailor-moon',
  ドラゴンボール: 'dragon-ball',
  '遊☆戯☆王': 'yu-gi-oh',
  '金色のガッシュ!!': 'gash-bell',
  デジモン: 'digimon',
};

function romanOf(key) {
  return ROMAN[key] ?? key;
}

/** 職掌 日文 → 中文（译名表之外，职掌是固定术语，值得写死） */
const ROLE_ZH = {
  脚本: '劇本',
  脚本演出: '劇本・導演',
  '脚本・演出': '劇本・導演',
  演出: '導演',
  振付: '編舞',
  音楽: '音樂',
  作曲: '作曲',
  美術: '美術',
  舞台美術: '舞台美術',
  衣裳: '服裝',
  殺陣: '武打指導',
  アクション監督: '動作指導',
  照明: '燈光',
  音響: '音響',
  映像: '影像',
  ヘアメイク: '髮妝',
  歌唱指導: '歌唱指導',
  演出助手: '助理導演',
  舞台監督: '舞台監督',
  宣伝美術: '宣傳美術',
  宣伝写真: '宣傳攝影',
  制作: '製作',
  主催: '主辦',
  企画: '企劃',
  原作: '原作',
  原作者: '原作',
  協力: '協力',
};

function splitNames(s) {
  if (!s) return [];
  return s
    .split(/[、,，／\/]/)
    .map((x) => x.trim())
    .filter((x) => x && x.length < 40);
}

/**
 * 「脚本・演出・作詞：川尻恵太（SUGARBOY）」→ StaffMember[]
 *
 * ★ 分隔符为什么是「：」而不是「/」：
 *   CoRich 的スタッフ格是「職掌：人名」，用全角冒号分行。
 *   只有少数条目写成「脚本/人名」。按「/」切会把
 *   「マーベラス/ネルケプランニング/KADOKAWA」这类公司名也切成三份。
 *   先按行切（br / 全角空格 / 顿号），再按第一个「：」或「/」拆角色与人名。
 */
function parseStaff(s) {
  if (!s) return [];
  const out = [];
  for (const part of s.split(/[\n　、]/)) {
    const line = part.trim();
    if (!line) continue;
    // 只取第一个分隔符，人名里常带括号与「＋」
    const m = line.match(/^(.+?)[：:／\/](.+)$/);
    if (!m) continue;
    const roleJa = m[1].trim();
    const name = m[2].trim();
    // 角色名过长说明这不是「职掌：人名」结构（多半是公司名或原作信息）
    if (!roleJa || !name || roleJa.length > 12) continue;
    const roleZh = ROLE_ZH[roleJa] ?? roleJa;
    out.push({ role: { zh: roleZh, ja: roleJa }, name });
  }
  return out;
}

/**
 * 都道府県 → 城市（本站筛选按城市聚合）
 *
 * ★ 为什么北海道要**单独**处理：它不是「〜県」，后缀是「道」。
 *   直接 replace(/[都道府県]$/) 会把「北海道」切成「北海」——
 *   于是筛选按钮上出现一个不存在的城市名「北海」。
 *   这类错误很隐蔽：筛选功能完全正常（「北海」也能筛），
 *   只有北海道的用户会看到自己的家乡被写错。
 */
function cityOf(pref) {
  if (pref === '北海道') return '札幌';
  const t = pref.replace(/(都|府|県)$/, '');
  const map = {
    東京: '東京',
    大阪: '大阪',
    京都: '京都',
    愛知: '名古屋',
    福岡: '福岡',
    宮城: '仙台',
    広島: '広島',
    神奈川: '横浜',
    埼玉: 'さいたま',
    兵庫: '神戸',
    千葉: '千葉',
    静岡: '静岡',
    沖縄: '那覇',
  };
  return map[t] ?? t;
}

/**
 * 补会場的地址与座席数（/theater/<id> 单页）
 *
 * ★ 为什么要单独再抓一轮：搜索结果里只有会場名与都道府県，
 *   而会場详情页上会显示「地址」「座席数」—— 用户要判断
 *   「这个会場在哪、多大」，这两项是必需信息。
 *
 * ★ 为什么失败时**静默跳过**而不是报错：
 *   会場详情是**增强信息**，不是必需信息。地址缺失只是会場页上少一行，
 *   而让整轮抓取因为它失败而中断，会连已经抓到的 54 部公演一起丢。
 *   所以个别会場抓不到就留空（页面已有 pref/city 兜底），
 *   只在最后统计一下成功率。
 */
async function enrichVenues(venueMap) {
  let ok = 0;
  let fail = 0;
  let n = 0;
  for (const v of venueMap.values()) {
    if (!v.theaterId) continue;
    n++;
    try {
      const html = await get('https://stage.corich.jp/theater/' + v.theaterId);
      const info = parseTheaterPage(html);
      if (info.address) v.address = info.address;
      // ★ 座席数只接受 > 0：CoRich 上大量会場登记的是「0 席」
      //   （那是「未登记」，不是「没有座位」）。把 0 写进去会渲染成
      //   「座席數 0」，用户会当成真信息。
      if (info.seats && info.seats > 0) v.seats = info.seats;
      if (info.name) v.name.ja = info.name;
      ok++;
    } catch (e) {
      fail++;
    }
    await sleep(DELAY_MS * 0.5);
    if (n % 20 === 0) console.log(`    ${n} 个会場…（成功 ${ok}）`);
  }
  console.log(`  会場详情：成功 ${ok}，失败 ${fail}`);
}

/**
 * 海报清晰度：拉普拉斯方差
 *
 * ★ 为什么先把图缩/裁到卡片实际显示的 460×613 再算：
 *   本站卡片上就是这么显示海报的（见第 7 步的 resize）。
 *   在**显示尺寸**上测清晰度，等于直接回答「用户看到的这张糊不糊」；
 *   若在原图尺寸上测，一张 2000px 的糊图会因为像素多而得分虚高。
 *
 * ★ 为什么用拉普拉斯方差：它度量的是高频能量 —— 糊图（低清放大、
 *   高斯模糊）的高频被削掉，方差就低。实测同一张图 600px 版 2069、
 *   840px 版 2983；而低清放大的图只有 300 上下，区分度足够。
 *
 * ★ 已知局限：大面积平涂的极简海报本身高频就少，得分也会偏低。
 *   所以它只用来**触发重新选图**，最终换不换图还要看候选之间谁更
 *   清楚（evaluatePoster），不会仅凭阈值误杀。
 */
async function sharpnessOf(sharp, input) {
  const { data, info } = await sharp(input)
    .resize(460, 613, { fit: 'cover', position: 'top' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = -4 * data[i] + data[i - 1] + data[i + 1] + data[i - w] + data[i + w];
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  const mean = sum / n;
  return Math.round(sum2 / n - mean * mean);
}

/**
 * 评估一张候选海报：清晰度 + 构图损失
 *
 * ★ 为什么要惩罚横版源图：卡片是 2:3 竖版。横版图 cover 裁成竖版时，
 *   左右会被切掉大半（实测 1.41 比例的横图只剩 53% 的画面）——
 *   即使像素更多、laplacian 更高，裁出来的往往只是「主角的鼻子」。
 *   所以按「保留画面比例」给清晰度打折，让竖版源图优先。
 */
async function evaluatePoster(sharp, url) {
  const buf = await getBinary(url);
  const meta = await sharp(buf).metadata();
  if (!meta.width || !meta.height) throw new Error('无法读取图片尺寸');
  /*
   * 先按尺寸刷掉明显的小图/占位图：协会站对「尚未公开」的海报
   * 会返回 2×2 或 280×400 的占位图（实测）。它们像素就那么多，
   * 再算 lap 也没意义，而且绝不能赢过真海报。
   */
  if (meta.width < 200 || meta.height < 200) {
    throw new Error(`尺寸过小（${meta.width}×${meta.height}，疑似占位图）`);
  }
  const lap = await sharpnessOf(sharp, buf);
  // 尺寸够大但近乎空白（「NOW PRINTING」类占位图）也拒掉
  if (lap < POSTER_MIN_ACCEPT_LAP) {
    throw new Error(`近乎空白（清晰度 ${lap}，疑似占位图）`);
  }
  const target = 460 / 613;
  const aspect = meta.width / meta.height;
  const kept = aspect >= target ? target / aspect : aspect / target;
  return {
    url,
    buf,
    lap,
    width: meta.width,
    height: meta.height,
    score: lap * (0.6 + 0.4 * kept),
  };
}

/**
 * 从 CoRich 总页 HTML 取出全部海报候选（按尺寸从大到小）
 *
 * ★ 为什么单独抽成函数：总页解析（parseMainPage）与
 *   --posters-only 的源页重建（candidatesFromSource）都要用它。
 *   两处各写一份正则，改了一处忘了另一处就会让两条路径选出不同的图。
 */
function corichPosterAll(html) {
  const rank = (u) => (u.includes('/l/') ? 2 : u.includes('/m/') ? 1 : 0);
  return [
    ...new Set(
      [
        ...html.matchAll(
          /src="(https:\/\/stage-image\.corich\.jp\/img_stage\/[a-z]+\/\d+\/stage_[^"?]+)"/g,
        ),
      ].map((m) => m[1]),
    ),
  ]
    .filter((u) => !/nophoto/.test(u))
    .sort((a, b) => rank(b) - rank(a));
}

/**
 * 协会站海报：显式要 2000×2000 拿原图
 *
 * ★ 实测：`w=&h=&t=max` 返回的是缩过的 600×857（竖版）或 600×425（横版），
 *   而 `w=2000&h=2000&t=max` 会返回 840×1200 / 1200×851 的原图 ——
 *   清晰度（laplacian）提升 1.4~3 倍。默认参数就是糊的主因。
 */
function j25PosterLarge(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('w', '2000');
    u.searchParams.set('h', '2000');
    return u.href;
  } catch {
    return url;
  }
}

/**
 * 官方站的主视觉候选（og:image + 页面内的大图）
 *
 * ★ 为什么不能只看 og:image：官方站的 og:image 是社交分享图，
 *   实测大多是 1200×630 的横版，裁成 2:3 竖版会切掉大半画面。
 *   而页面里往往藏着真正的竖版主视觉 —— 例：忍たま長屋的
 *   `img/gonen02.jpg`（960×1358）、魔法使いの約束的
 *   `bg_top_sp.png`（749×1092）—— 它们才是该用的海报。
 *   所以把 og:image 与页面内的候选图都收进来，交给
 *   evaluatePoster 按「清晰度 × 构图保留率」择优。
 *
 * ★ 为什么敢把整页的 <img> 都收进来：这段只在海报被判定为糊时
 *   才执行（见 refreshPosters），一次抓取里通常只有几张命中；
 *   而且 evaluatePoster 会把 logo/图标/小图/横版低清图刷掉。
 *   为控制请求量，候选数上限 20。
 *
 * ★ 失败一律返回空数组：官方站改版/防抓是常态，
 *   不能让它拖垮整轮海报处理。
 */
async function officialPosterCandidates(officialUrl) {
  try {
    const html = await get(officialUrl);
    const raw = [];
    // og:image / twitter:image 优先
    for (const m of html.matchAll(
      /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi,
    )) {
      const c = m[0].match(/content=["']([^"']+)["']/i);
      if (c) raw.push(c[1]);
    }
    // 页面内的 <img>：src / data-src / data-lazy-src / data-original / srcset
    for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      for (const attr of ['src', 'data-src', 'data-lazy-src', 'data-original']) {
        const v = tag.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i'));
        if (v) raw.push(v[1]);
      }
      const ss = tag.match(/\bsrcset=["']([^"']+)["']/i);
      if (ss) {
        // srcset 里最后一项通常分辨率最高
        const last = ss[1]
          .split(',')
          .map((s) => s.trim().split(/\s+/)[0])
          .filter(Boolean)
          .pop();
        if (last) raw.push(last);
      }
    }
    // 内联背景图（有些站把主视觉做成 CSS 背景）
    for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/gi)) {
      raw.push(m[1]);
    }
    return [
      ...new Set(
        raw
          .map((u) => {
            try {
              return new URL(u.replace(/&amp;/g, '&'), officialUrl).href;
            } catch {
              return null;
            }
          })
          .filter(Boolean),
      ),
    ]
      .filter((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u))
      // 明显不是主视觉的：logo/图标/按钮/横幅/日程/装饰/加载图
      .filter(
        (u) =>
          !/(logo|icon|btn|button|banner|bnr|sprite|spacer|pixel|schedule|header|footer|movie|loading|placeholder|favicon)/i.test(
            u,
          ),
      )
      .slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * 从作品来源页重建海报候选（供 --posters-only 使用）
 *
 * ★ 为什么 shows.json 里不存图源 URL：它只是抓取过程中的中间量，
 *   存进数据文件会让每部作品多出几条长 URL，而页面一个都不用。
 *   需要时从 sourceUrl 现取即可（HTML 有缓存，很便宜）。
 */
async function candidatesFromSource(s) {
  const url = s.sourceUrl;
  if (!url) return [];
  try {
    if (/j25musical\.jp/.test(url)) {
      const html = await get(url);
      const cid = first(/showCtsImage\.php\?cid=(\d+)/, html);
      return cid
        ? [`https://www.j25musical.jp/showCtsImage.php?cid=${cid}&no=1&w=2000&h=2000&t=max`]
        : [];
    }
    if (/stage\.corich\.jp\/stage_main\//.test(url)) {
      return corichPosterAll(await get(url));
    }
  } catch {
    /* 源站页取不到就返回空候选，走「无更好来源」分支 */
  }
  return [];
}

/**
 * 把候选图压成卡片用的 WebP 并落到 outPath
 *
 * ★ 为什么先写 .tmp 再 rename，而不是直接 toFile(outPath)：
 *   Windows 上 libvips 对「刚读过同一路径、又写回该路径」会报
 *   `unable to open for write / Invalid argument`（实测稳定复现）——
 *   因为它在文件缓存里还持有那个路径。写临时文件再原子替换绕开了它，
 *   顺便保证不会留下写坏的半张图。
 */
async function writePosterWebp(sharp, buf, outPath) {
  const tmp = outPath + '.tmp';
  await sharp(buf)
    .resize(460, 613, { fit: 'cover', position: 'top' })
    .webp({ quality: 78 })
    .toFile(tmp);
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, outPath);
      return;
    } catch (e) {
      if (i >= 3) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* 临时文件清理失败不影响主流程 */
        }
        throw e;
      }
      await sleep(300);
    }
  }
}

/**
 * 下载 / 升级海报，并回填主色
 *
 * 全量抓取（main 第 7 步）与 --posters-only 共用这一份逻辑。
 *
 * ★ 核心规则：海报按 slug 缓存，但「已存在」不等于「够清楚」——
 *   先量清晰度，糊的才去比对候选重新选图；候选明显更清楚才换。
 */
async function refreshPosters(shows, sharp) {
  let ok = 0; // 新下载
  let upgraded = 0; // 旧的糊 → 换成更清楚的
  let kept = 0; // 已存在且够清楚，沿用
  let noBetter = 0; // 现图够清楚，只是候选没能明显更好
  let manual = 0; // 人工确认的海报（跳过清晰度判定）
  let fail = 0;
  const fallbackToArt = []; // 源站只有低清 → 改用示意海报

  /*
   * ★ 人工确认过的海报：直接采用，不参与清晰度判定。
   *
   *   为什么需要这份名单：
   *     ① 有些作品的官方主视觉是大面积渐变的（例如 DEATH NOTE 那张
   *        蓝底苹果），Laplacian 方差天然就低，会被 POSTER_MIN_LAP
   *        判成「糊图」而删掉 —— 但它其实是一张好海报；
   *     ② 而它的官方站又可能被 Cloudflare 挡住，脚本自己抓不到替代图。
   *   此时只能由人把图放进 public/posters/<slug>.webp 并在
   *   data/poster-supplements.json 里登记 —— 人工确认过的东西
   *   不该再让启发式推翻。
   */
  const manualFile = path.join(DATA_DIR, 'poster-supplements.json');
  const manualSlugs = new Set(
    fs.existsSync(manualFile)
      ? Object.keys(JSON.parse(fs.readFileSync(manualFile, 'utf8')).entries ?? {})
      : [],
  );

  for (const s of shows) {
    const outName = s.slug + '.webp';
    const outPath = path.join(POSTER_DIR, outName);
    const hasStored = fs.existsSync(outPath) && fs.statSync(outPath).size > 2000;

    if (manualSlugs.has(s.slug)) {
      if (!hasStored) {
        console.warn(`    ! ${s.slug}：在人工海报名单里，但 public/posters/${outName} 不存在`);
      } else {
        s.poster = '/posters/' + outName;
        const c = await dominantColor(sharp, outPath);
        if (c) s.accent = c;
        manual++;
        continue;
      }
    }
    /*
     * ★ 用 Buffer 而不是路径喂给 sharp：Windows 上 libvips 会按路径缓存文件，
     *   紧接着再写回同一路径就会报 `unable to open for write`（实测稳定复现）。
     *   先自己读进内存就避开了这个路径缓存。
     */
    const storedLap = hasStored ? await sharpnessOf(sharp, fs.readFileSync(outPath)) : 0;
    /*
     * storedUsable：现图是一张「真图」而不是占位/空白图。
     * 占位图（如「NOW PRINTING」）虽然文件存在，但不能当海报用 ——
     * 它不能挡住候选的重新选择，也不能在没候选时继续挂着。
     */
    const storedUsable = hasStored && storedLap >= POSTER_MIN_ACCEPT_LAP;

    /*
     * 够清楚就沿用（幂等 / 断点续跑）。
     *
     * ★ 为什么「已存在就跳过」不够：海报是按 slug 命名的缓存，
     *   而选图逻辑与源站图都会变 —— 早先抓到的糊图会一直留着，
     *   表现为「代码改了、线上还是糊的」。所以改成按**清晰度**判定：
     *   够清楚才跳过，糊的走下面的重新选图。
     *
     * ★ 已有图也要取色：取色算法会改，而海报文件是缓存的、不会重下 ——
     *   若跳过已存在的图，改了算法也永远不会生效。只在 accent 仍是
     *   兜底色、或显式要求时重算，避免每次全量解码 40+ 张图。
     */
    if (storedUsable && storedLap >= POSTER_MIN_LAP && !REFRESH_POSTERS) {
      s.poster = '/posters/' + outName;
      if (REBUILD_ACCENT || s.accent === DEFAULT_ACCENT) {
        const c = await dominantColor(sharp, outPath);
        if (c) s.accent = c;
      }
      kept++;
      continue;
    }

    // 候选：协会站原图 / CoRich l、m
    const cands = [...(s.posterCandidates ?? [])];
    /*
     * 还糊的话，再去找官方站的主视觉兜底（og:image + 页面内的大图）。
     *
     * ★ 为什么放到最后才找：抓官方站是额外请求；而且它的主视觉往往
     *   是横版，只有协会站/CoRich 都给不出清楚图时才值得一试。
     */
    if (s.officialUrl) cands.push(...(await officialPosterCandidates(s.officialUrl)));

    let best = null;
    const why = [];
    for (const url of [...new Set(cands)]) {
      try {
        const r = await evaluatePoster(sharp, url);
        if (!best || r.score > best.score) best = r;
      } catch (e) {
        why.push(`${url.replace(/^https?:\/\/[^/]+/, '')}: ${e.message}`);
      }
      await sleep(200);
    }

    /*
     * 换图条件（两个都要满足）：
     *   ① 候选本身达到「清楚」标准（best.lap >= POSTER_MIN_LAP）——
     *      否则宁可不用真海报（见下面的示意海报分支）；
     *   ② 候选明显优于现图（留 10% 余量）——
     *      候选是 JPEG 源、现图是 q78 WebP，同一张图也会差几个百分点，
     *      不设余量会每次重跑都白重写一遍。
     */
    if (best && best.lap >= POSTER_MIN_LAP && (!storedUsable || best.score > storedLap * 1.1)) {
      try {
        /*
         * 裁成 2:3（海报的标准比例）后压成 WebP。
         *
         * ★ 为什么必须在构建期压好：本站是静态导出
         *   （next.config.ts 的 images.unoptimized = true），没有运行时
         *   图片优化器。原图有 400KB+ 的 JPEG，40+ 张就是 20MB+，
         *   首屏会直接卡在下载上。压到 460×613 / q78 后单张约 20~40KB。
         *
         * ★ fit: 'cover' + position: 'top'：海报的上半部是标题与角色脸，
         *   居中被裁会把主视觉切掉一半（实测过几张纵长图）。
         */
        await writePosterWebp(sharp, best.buf, outPath);
        s.poster = '/posters/' + outName;
        const c = await dominantColor(sharp, outPath);
        if (c) s.accent = c;
        if (hasStored) {
          upgraded++;
          const host = best.url.replace(/^https?:\/\//, '').split(/[/?]/)[0];
          console.log(
            `    ↑ ${s.slug}：清晰度 ${storedLap} → ${best.lap}（${best.width}×${best.height}，${host}）`,
          );
        } else {
          ok++;
        }
      } catch (e) {
        fail++;
        console.warn(`    ! ${s.slug} 海报失败：${e.message}`);
      }
    } else if (storedUsable && storedLap >= POSTER_MIN_LAP) {
      // 现图本身够清楚，只是候选没能明显更好 → 沿用
      s.poster = '/posters/' + outName;
      noBetter++;
    } else {
      /*
       * 源站只有低清图（协会站/CoRich/官方站都没有更清楚的）→
       * 改用本站生成的示意海报，并把磁盘上的糊图删掉。
       *
       * ★ 为什么宁可没有真海报：一张糊海报在网格里比示意海报更糟 ——
       *   用户看到的是「一张看不清的图」，而不是「本站暂时没有这张图」。
       *   poster=null 会走 PosterArt 的已知降级路径，视觉上是一致的。
       */
      s.poster = null;
      try {
        // 不管 hasStored（小文件会被 2000B 阈值判为「不存在」，但仍需清掉）
        if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
      } catch {
        /* 删不掉也不影响（只是部署里多一个没人引用的文件） */
      }
      fallbackToArt.push(
        `${s.slug}（原图清晰度 ${storedLap || 0}，最高候选 ${best ? best.lap : 0}）` +
          (!best && why.length ? `；候选均不可用：${why.slice(0, 3).join('；')}` : ''),
      );
    }
    await sleep(300);
  }
  console.log(
    `  海报：新下载 ${ok}，糊图升级 ${upgraded}，沿用 ${kept}，无更好来源 ${noBetter}，人工确认 ${manual}，改用示意海报 ${fallbackToArt.length}，失败 ${fail}`,
  );
  if (fallbackToArt.length) {
    console.log(`  ⚠ ${fallbackToArt.length} 张源站只有低清图，已改用示意海报：`);
    for (const b of fallbackToArt.slice(0, 20)) console.log(`    · ${b}`);
  }
}

/**
 * 从海报取主色（返回 #RRGGBB）
 *
 * ★★ 为什么不能用 stats().dominant（实测踩到的坑）★★
 *   dominant 是「出现最多的量化色」。而 2.5 次元海报的结构是
 *   「大片留白 + 深色边框 + 中间的角色」，于是 dominant 实测大量落在
 *   **248（白留白）** 或 **8（黑边/暗底）** 上 —— 51 张里只有 9 张
 *   取到了真正的作品色，其余全是纯白或纯黑。
 *   纯白主色会让详情页的氛围层变成一片白、把白字吃掉；
 *   纯黑则等于没有主色。
 *
 *   所以这里改为：先**丢弃**留白与死黑像素，再对剩下的取平均。
 *   平均色才代表「这张海报整体的色调」—— 这也是 hkmovie
 *   （scripts/poster-colors.mjs）的做法。
 *
 * ★ 阈值为什么是 L>0.80 / L<0.04：
 *   留白实测是 248（L=0.94），黑边是 8（L=0.002）。
 *   但海报本身也可能是**深色系**（舞台剧海报常见暗底）——
 *   若把阈值定得太高（例如 L<0.15 就丢），暗底海报会被整张丢光，
 *   取不出色。0.04 能丢掉纯黑边框而保留暗底。
 *
 * ★ 返回值一定是合法 #RRGGBB：accent 会被注入 CSS，
 *   格式错会导致整块背景失效（validate 也查这一项）。
 */
async function dominantColor(sharp, file) {
  try {
    const SIZE = 48;
    const { data } = await sharp(file)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const lin = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 3) {
      const R = data[i];
      const G = data[i + 1];
      const B = data[i + 2];
      const L = lum(R, G, B);
      if (L > 0.8 || L < 0.04) continue;
      r += R;
      g += G;
      b += B;
      n++;
    }
    // 可用像素太少（整张都是留白或死黑）→ 放弃，保留兜底色
    if (n < SIZE * SIZE * 0.06) return null;

    r = Math.round(r / n);
    g = Math.round(g / n);
    b = Math.round(b / n);

    /*
     * 提饱和：平均色天然偏灰（把整张图的色相混在一起了）。
     *
     * ★ 为什么必须提：主色的用途之一是示意海报的底色，
     *   而 PosterArt 会按它做渐变 —— 用平均灰做出来的示意海报
     *   在网格里是一片看不出差别的灰。
     *   1.45 倍（以中灰为轴心外推）后色相可辨，又不会变成荧光色。
     *
     * ★ 为什么用「外推」而不是乘：乘以系数会把暗色压得更暗，
     *   而海报主色常常就是暗色（深蓝、暗红）。
     */
    const mid = 128;
    const ext = (v) => Math.max(0, Math.min(255, Math.round(mid + (v - mid) * 1.45)));
    r = ext(r);
    g = ext(g);
    b = ext(b);

    /*
     * ★★ 亮度上限：过亮的主色必须压回暗调 ★★
     *
     *   主色在本站有两个用途：① 详情页头部的主色氛围层（.jp-accent-panel）；
     *   ② 无海报时示意海报的底色。两者都是**暗底**场景 ——
     *   氛围层要托住浅色文字，示意海报要托住白字。
     *
     *   而实测（接入真实抓取后）有 10/51 张海报的平均色亮度超过 0.35，
     *   最亮的一张是 #FECDED（L=0.71，粉白）。用这种色做氛围层，
     *   暗色主题下的次级文字（dim #90909A）实测掉到 **2.70:1** ——
     *   远低于 AA 的 4.5。
     *
     *   修法是在**取色端**把亮度压到 0.28 以下（向近黑混），
     *   而不是在 CSS 里再调 alpha：alpha 是按「主色是暗色」这个前提
     *   标定的（见 --jp-accent-panel 的 0.70× 扫描），
     *   为了几张亮色海报去改它，会让其余 41 张的主色都变弱。
     *
     *   ★ 为什么是 0.28：低于它之后，「亮海报」与「暗海报」的主色
     *     在页面上就分不出来了（都变成同一档暗色）。
     *     0.28 仍明显亮于最暗的 #4C2C5C（L=0.04），层次保住了。
     */
    const lumOf = (rr, gg, bb) => 0.2126 * lin(rr) + 0.7152 * lin(gg) + 0.0722 * lin(bb);
    let L2 = lumOf(r, g, b);
    if (L2 > 0.28) {
      // 二分出混向近黑的比例（比解析求解简单，且足够精确）
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i++) {
        const t = (lo + hi) / 2;
        const L3 = lumOf(
          Math.round(r + (12 - r) * t),
          Math.round(g + (12 - g) * t),
          Math.round(b + (14 - b) * t),
        );
        if (L3 > 0.28) lo = t;
        else hi = t;
      }
      const t = hi;
      r = Math.round(r + (12 - r) * t);
      g = Math.round(g + (12 - g) * t);
      b = Math.round(b + (14 - b) * t);
    }

    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function readData() {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
  return { shows: read('shows.json'), series: read('series.json'), venues: read('venues.json') };
}

function writeJson(name, data) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// ────────────────────────────────────────────────────────────
// 校验（与旧版一致：跨文件引用、日期、双语、status）
// ────────────────────────────────────────────────────────────

function validate({ shows, series, venues }) {
  const errors = [];
  const warnings = [];
  const seriesIds = new Set(series.map((s) => s.id));
  const venueIds = new Set(venues.map((v) => v.id));
  const slugs = new Set();
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

  for (const s of shows) {
    const where = `show「${s.slug ?? '(no slug)'}」`;
    if (!s.slug) errors.push(`${where}: 缺少 slug`);
    else if (slugs.has(s.slug)) errors.push(`${where}: slug 重复`);
    else slugs.add(s.slug);

    if (!s.title?.zh?.trim()) errors.push(`${where}: title.zh 为空`);
    if (!s.title?.ja?.trim()) errors.push(`${where}: title.ja 为空`);
    if (!s.summary?.ja?.trim()) warnings.push(`${where}: summary.ja 为空`);
    if (!s.summary?.zh?.trim()) warnings.push(`${where}: summary.zh 为空`);

    if (!seriesIds.has(s.seriesId)) errors.push(`${where}: seriesId「${s.seriesId}」不存在`);
    if (!s.runs?.length) errors.push(`${where}: runs 为空`);

    for (const r of s.runs ?? []) {
      if (!venueIds.has(r.venueId)) errors.push(`${where}: venueId「${r.venueId}」不存在`);
      if (!isDate(r.startDate)) errors.push(`${where}: run.startDate「${r.startDate}」格式错`);
      if (!isDate(r.endDate)) errors.push(`${where}: run.endDate「${r.endDate}」格式错`);
      if (isDate(r.startDate) && isDate(r.endDate) && r.startDate > r.endDate) {
        errors.push(`${where}: startDate 晚于 endDate`);
      }
    }

    if (!/^#[0-9a-fA-F]{6}$/.test(s.accent ?? '')) errors.push(`${where}: accent 格式错`);

    if (s.runs?.length) {
      const start = s.runs.reduce((a, r) => (r.startDate < a ? r.startDate : a), s.runs[0].startDate);
      const end = s.runs.reduce((a, r) => (r.endDate > a ? r.endDate : a), s.runs[0].endDate);
      const expect = end < todayJst ? 'ended' : start > todayJst ? 'upcoming' : 'now';
      if (s.status && s.status !== expect) {
        errors.push(`${where}: status「${s.status}」与日期不符（应为 ${expect}）`);
      }
      if (s.startDate && s.startDate !== start) errors.push(`${where}: startDate 与 runs 不一致`);
      if (s.endDate && s.endDate !== end) errors.push(`${where}: endDate 与 runs 不一致`);
    }
  }

  /*
   * 售票平台：只查「形状」不查内容 ——
   *   它是**参考信息**，缺了不影响公演本身（与 venue.city 同一档），
   *   但 vendor id 必须是我们认得的那几个：否则筛选器里会出现一个
   *   点进去什么都没有、也匹配不到任何卡片的幽灵选项。
   */
  for (const s of shows) {
    if (!Array.isArray(s.ticketChannels)) {
      errors.push('show「' + s.slug + '」: 缺少 ticketChannels');
      continue;
    }
    for (const c of s.ticketChannels) {
      if (!TICKET_VENDOR_IDS.has(c.vendor)) {
        errors.push('show「' + s.slug + '」: 未知售票平台「' + c.vendor + '」');
      }
      if (c.url && !/^https?:\/\//.test(c.url)) {
        errors.push('show「' + s.slug + '」: 售票链接不是 http(s)（' + c.url + '）');
      }
    }
  }

  for (const v of venues) {
    if (!v.id) errors.push('venue: 缺少 id');
    if (!v.name?.zh?.trim() || !v.name?.ja?.trim()) errors.push(`venue「${v.id}」: name 双语缺失`);
    /*
     * ★ city 缺失只**警告**，不阻断：
     *   它只用于筛选聚合，而会場页上还有会場名这个主信息。
     *   为它阻断整轮抓取，等于让「一个会場查不到所在地」
     *   毁掉整站数据的更新 —— 这个代价与问题严重性完全不成比例。
     *   （实测：协会站 9 部里有 6 部的会場名不含任何地名。）
     */
    if (!v.city) warnings.push(`venue「${v.id}」: 缺 city（会場名不含地名，筛选里不会出现）`);
  }
  for (const sr of series) {
    if (!sr.id) errors.push('series: 缺少 id');
    if (!sr.name?.zh?.trim() || !sr.name?.ja?.trim()) errors.push(`series「${sr.id}」: name 双语缺失`);
    if (!sr.sourceKind) errors.push(`series「${sr.id}」: 缺少 sourceKind`);
  }

  // 中文 == 日文（说明翻译没接上，中文模式下等于没翻译）
  //
  // ★ 纯英文/数字标题不算问题：「Paradox Live on Stage -Road to Legend- "RAGE"」
  //   这类作品本来就没有中文名，中文模式下显示原文才是对的。
  //   所以允许的字符集要包含双引号、冒号这些英文标题常见符号，
  //   否则会报一堆假警告（真警告混在里面就没人看了）。
  for (const s of shows) {
    if (s.title.zh === s.title.ja && !/^[A-Za-z0-9 !&'()\-.,/:;"“”]+$/.test(s.title.ja)) {
      warnings.push(`show「${s.slug}」: 中文标题与日文相同（译名表未覆盖 / 翻译失败）`);
    }
  }

  return { errors, warnings };
}

function report(data, errors, warnings) {
  console.log(
    `\n数据校验：${data.shows.length} 部公演 / ${data.series.length} 个系列 / ${data.venues.length} 个会場`,
  );
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} 项警告：`);
    for (const w of warnings.slice(0, 25)) console.log('  · ' + w);
  }
  if (errors.length) {
    console.log(`\n✗ ${errors.length} 项错误：`);
    for (const e of errors.slice(0, 25)) console.log('  · ' + e);
    process.exitCode = 1;
  } else {
    console.log('\n✓ 无错误');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
