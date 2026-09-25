#!/usr/bin/env node
/**
 * 抓取脚本 —— **接口骨架**（尚未接入真实数据源）
 *
 * ════════════════════════════════════════════════════════════════════
 *  当前状态
 * ════════════════════════════════════════════════════════════════════
 *
 *  本站目前跑在 data/*.json 的**手写示范数据**上，页面上有明确的
 *  「示範資料」提示条（见 components/DemoNotice.tsx）。
 *
 *  本文件是接入真实抓取时的**落点**：它把「一份数据要满足什么约束」
 *  用代码固化下来，并提供一个 `validate()` 可以直接跑。
 *
 *  ★ 为什么不先写抓取、再补校验：
 *    抓取逻辑会随目标站点的 HTML 结构反复重写，而**数据约束是稳定的**。
 *    先把约束写下来，抓取脚本无论怎么改都能拿它自查 ——
 *    顺序反过来（先写抓取），约束往往只存在于作者脑子里，
 *    换个站点重写时就丢了，数据里会慢慢混进 status 与日期矛盾、
 *    空标题、不存在的 venueId 之类的问题，而且**在页面上看不出来**
 *    （页面只是少显示一块，不会报错）。
 *
 * ════════════════════════════════════════════════════════════════════
 *  接入真实数据源的步骤
 * ════════════════════════════════════════════════════════════════════
 *
 *  1. 在 SOURCES 里登记数据源（名称 + 抓取函数）
 *  2. 每个抓取函数返回 RawShow[]，再由 normalize() 转成 Show
 *  3. 跑 `node scripts/scrape.mjs --validate-only` 确认数据合规
 *  4. 把 source 从 'sample' 改成站点标识 —— 提示条会自动消失
 *     （getMeta().demo 是**数据驱动**的，不需要改任何组件代码）
 *
 * ════════════════════════════════════════════════════════════════════
 *  双语数据从哪来（这是本站与 hkmovie 最大的不同）
 * ════════════════════════════════════════════════════════════════════
 *
 *  hkmovie 是单语站，抓到什么就显示什么。本站每个面向用户的文案都是
 *  { zh, ja } 二元组（见 lib/types.ts 的说明），所以抓取阶段必须
 *  为两种语言各取一份值。三条可行路径，按可靠性排序：
 *
 *   ① 官方站本身提供双语（部分大型企划的官网有 EN/zh 版）→ 直接取
 *   ② 日文原名 + 机器翻译 → 作为 zh 值，**并在数据里标注来源**
 *      （机器翻译的作品名常有偏差，例如「呪術廻戦」应译作
 *        「咒術迴戰」而不是直译「咒术回战」—— 后者是简中译名，
 *        繁体用户会觉得别扭。所以机器翻译只适合做**兜底**，
 *        常用作品应维护一张译名表）
 *   ③ 人工维护一张「日文原名 → 中文译名」表，抓取时查表
 *      ★ 这是最适合 2.5 次元场景的做法：热门 IP 数量有限（几百个），
 *        而它们的官方中文译名是**稳定且唯一**的，值得人工维护。
 *        表放在 data/series.json 里（本文件已按这个结构设计）。
 *
 *   ⚠️ 无论用哪条路径，都不允许出现「zh 为空字符串」：
 *      那会在中文模式下渲染出空白，而页面上看不出是数据缺失
 *      还是布局问题。validate() 会拦下这种情况。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');

const args = new Set(process.argv.slice(2));
const VALIDATE_ONLY = args.has('--validate-only');

/**
 * 数据源登记表
 *
 * ★ 为什么用「数组 + 统一的抓取函数签名」而不是一个 if/else 分支：
 *   2.5 次元公演没有单一权威数据源 —— 大型企划各有官网，
 *   中型企划只有 X（Twitter）账号，还有些只在票务平台上。
 *   所以必然是「多源合并」。统一签名让新增一个源只需要加一条记录，
 *   而合并、去重、冲突处理这些**共性问题**写在下面的 pipeline 里，
 *   每个源各自实现时必然会各写一遍（且写得不一样）。
 *
 * ★ 每一项的 enabled 为什么默认 false：
 *   抓取会真的发网络请求，可能被目标站限流甚至封禁。
 *   默认关闭，必须显式打开（`--source=xxx`），
 *   这样「跑一下脚本看看」不会无意中打出几百个请求。
 */
const SOURCES = [
  {
    id: 'sample',
    name: '示範資料',
    enabled: false,
    /** 返回 RawShow[] */
    async fetch() {
      // 示范数据直接读文件 —— 它是手写的，不需要抓取
      return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'shows.json'), 'utf8'));
    },
  },
  /*
  {
    id: 'official',
    name: '各公演官方網站',
    enabled: false,
    async fetch() {
      // 实现要点（接入时参考）：
      //  1. 每个企划的官网结构不同 —— 用一个「站点适配器」表
      //     （域名 → 解析函数），而不是给每个站写一份完整抓取
      //  2. 必须设置 User-Agent 与合理的请求间隔（≥1s），
      //     并在 robots.txt 允许的范围内抓取
      //  3. 只抓**列表页与详情页的公开信息**，不碰需要登录的内容
      //  4. 解析结果立刻归一化成 RawShow，不要把 HTML 带进 pipeline
      return [];
    },
  },
  {
    id: 'eplus',
    name: 'イープラス（票務平台）',
    enabled: false,
    async fetch() {
      // 票务平台能提供**售票状态与场次**，这是官网常常没有的
      // ⚠️ 但票务平台的条款通常禁止自动化访问 —— 接入前必须确认许可，
      //    否则应改用「官方公告 + 人工更新」的方式
      return [];
    },
  },
  */
];

/**
 * 原始条目 → 标准化 Show
 *
 * ★ 为什么要有这一层（而不是让抓取函数直接产出最终的 Show）：
 *   不同源的同一条公演，字段名与粒度都不一样
 *   （A 站叫 `title_jp`，B 站叫 `name`；A 站给单个日期，B 站给期间）。
 *   如果把「翻译、补全、合并」散在各个抓取函数里，
 *   每加一个源就要重写一遍这些逻辑，且必然写得不一致。
 *   收在一个函数里之后，抓取函数只需老实返回它看到的东西。
 *
 * ★ 本函数目前是**恒等变换 + 补全默认值**：
 *   示范数据已经是最终结构，所以它只做校验性的补全。
 *   接入真实源时在这里加「翻译查表」「日期区间展开」「系列归并」。
 */
function normalize(raw, sourceId) {
  return {
    ...raw,
    source: raw.source ?? sourceId,
    runs: raw.runs ?? [],
    cast: raw.cast ?? [],
    staff: raw.staff ?? [],
  };
}

/**
 * 数据校验
 *
 * ★ 这是本文件**当前最有价值的部分**：它可以在没有真实抓取的情况下
 *   立刻跑起来，把数据里的问题找出来。抓取接入后它会继续发挥同样作用 ——
 *   抓取脚本最容易出的错（字段缺失、日期颠倒、引用不存在的 ID）
 *   都是**静默**的，页面只会少显示一块，不会报错。
 *
 * ★ 为什么校验放在脚本里而不是用 JSON Schema / zod：
 *   这些规则里有一部分是**跨文件**的（show.seriesId 必须存在于 series.json、
 *   run.venueId 必须存在于 venues.json、status 必须与日期一致），
 *   JSON Schema 表达不了。用一个普通函数写清楚，比引一个库更直接，
 *   也更容易加「本站特有的约束」（例如双语字段不得为空）。
 */
function validate({ shows, series, venues }) {
  const errors = [];
  const warnings = [];

  const seriesIds = new Set(series.map((s) => s.id));
  const venueIds = new Set(venues.map((v) => v.id));
  const slugs = new Set();

  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  /** 取「今天」（日本时间）—— 与 lib/data.ts 用同一个基准，避免判定不一致 */
  const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

  for (const s of shows) {
    const where = `show「${s.slug ?? '(no slug)'}」`;

    // ── 必填字段 ──
    if (!s.slug) errors.push(`${where}: 缺少 slug`);
    else if (slugs.has(s.slug)) errors.push(`${where}: slug 重复`);
    else slugs.add(s.slug);

    if (!s.title?.zh?.trim()) errors.push(`${where}: title.zh 为空（中文模式会渲染空白）`);
    if (!s.title?.ja?.trim()) errors.push(`${where}: title.ja 为空（日文模式会渲染空白）`);
    if (!s.summary?.zh?.trim()) warnings.push(`${where}: summary.zh 为空`);
    if (!s.summary?.ja?.trim()) warnings.push(`${where}: summary.ja 为空`);

    // ── 跨文件引用 ──
    if (!seriesIds.has(s.seriesId)) {
      errors.push(`${where}: seriesId「${s.seriesId}」不存在于 series.json`);
    }
    if (!s.runs?.length) {
      errors.push(`${where}: runs 为空（详情页的档期表会是空白）`);
    }
    for (const r of s.runs ?? []) {
      if (!venueIds.has(r.venueId)) {
        errors.push(`${where}: run.venueId「${r.venueId}」不存在于 venues.json`);
      }
      if (!isDate(r.startDate)) errors.push(`${where}: run.startDate「${r.startDate}」不是 YYYY-MM-DD`);
      if (!isDate(r.endDate)) errors.push(`${where}: run.endDate「${r.endDate}」不是 YYYY-MM-DD`);
      if (isDate(r.startDate) && isDate(r.endDate) && r.startDate > r.endDate) {
        errors.push(`${where}: run 的 startDate(${r.startDate}) 晚于 endDate(${r.endDate})`);
      }
    }

    // ── 主色格式（它会被注入 CSS，格式错会导致整块背景失效）──
    if (!/^#[0-9a-fA-F]{6}$/.test(s.accent ?? '')) {
      errors.push(`${where}: accent「${s.accent}」不是 #RRGGBB 格式`);
    }

    // ── 与 lib/data.ts 的 status 判定保持一致 ──
    if (s.runs?.length) {
      const start = s.runs.reduce((a, r) => (r.startDate < a ? r.startDate : a), s.runs[0].startDate);
      const end = s.runs.reduce((a, r) => (r.endDate > a ? r.endDate : a), s.runs[0].endDate);
      const expect = end < todayJst ? 'ended' : start > todayJst ? 'upcoming' : 'now';
      if (s.status && s.status !== expect) {
        errors.push(
          `${where}: status「${s.status}」与日期不符（${start}~${end} 应为「${expect}」）—— 静态导出下 status 由数据决定，写错会长期静默错误`,
        );
      }
      if (s.startDate && s.startDate !== start) {
        errors.push(`${where}: startDate「${s.startDate}」与 runs 的最小开始日「${start}」不一致`);
      }
      if (s.endDate && s.endDate !== end) {
        errors.push(`${where}: endDate「${s.endDate}」与 runs 的最大结束日「${end}」不一致`);
      }
    }

    // ── 重复会場（同一公演在同一会場有多档是合法的，但同一会場+同一开始日是重复）──
    const seenRun = new Set();
    for (const r of s.runs ?? []) {
      const k = `${r.venueId}@${r.startDate}`;
      if (seenRun.has(k)) warnings.push(`${where}: 重复的档期 ${k}`);
      seenRun.add(k);
    }
  }

  // ── 会場数据 ──
  for (const v of venues) {
    if (!v.id) errors.push(`venue「${v.name?.zh ?? '?'}」: 缺少 id`);
    if (!v.name?.zh?.trim() || !v.name?.ja?.trim()) {
      errors.push(`venue「${v.id}」: name 的 zh / ja 有缺失`);
    }
    if (!v.pref) warnings.push(`venue「${v.id}」: 缺少 pref（都道府県）`);
    if (!v.city) errors.push(`venue「${v.id}」: 缺少 city（城市筛选依赖它）`);
  }

  // ── 系列数据 ──
  for (const sr of series) {
    if (!sr.id) errors.push(`series「${sr.name?.zh ?? '?'}」: 缺少 id`);
    if (!sr.name?.zh?.trim() || !sr.name?.ja?.trim()) {
      errors.push(`series「${sr.id}」: name 的 zh / ja 有缺失`);
    }
    if (!sr.original?.zh?.trim() || !sr.original?.ja?.trim()) {
      errors.push(`series「${sr.id}」: original 的 zh / ja 有缺失`);
    }
    if (!sr.sourceKind) errors.push(`series「${sr.id}」: 缺少 sourceKind`);
  }

  // ── 孤立数据（有会場/系列但没有任何公演引用）──
  const usedSeries = new Set(shows.map((s) => s.seriesId));
  const usedVenues = new Set(shows.flatMap((s) => (s.runs ?? []).map((r) => r.venueId)));
  for (const sr of series) {
    if (!usedSeries.has(sr.id)) warnings.push(`series「${sr.id}」没有任何公演引用（列表页会显示 0 部）`);
  }
  for (const v of venues) {
    if (!usedVenues.has(v.id)) warnings.push(`venue「${v.id}」没有任何公演引用`);
  }

  return { errors, warnings };
}

/** 从磁盘读当前数据（校验用） */
function readData() {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
  return { shows: read('shows.json'), series: read('series.json'), venues: read('venues.json') };
}

async function main() {
  const enabled = SOURCES.filter((s) => s.enabled);

  if (!VALIDATE_ONLY) {
    if (enabled.length === 0) {
      console.log(
        [
          '',
          '抓取脚本尚未接入真实数据源（SOURCES 里所有条目的 enabled 都是 false）。',
          '',
          '  当前站点跑在 data/*.json 的手写示范数据上。',
          '  接入真实数据源的步骤见本文件顶部的说明。',
          '',
          '  现在可以先做数据校验（不需要网络）：',
          '    node scripts/scrape.mjs --validate-only',
          '',
        ].join('\n'),
      );
      process.exit(0);
    }

    console.log(`将抓取 ${enabled.length} 个数据源：${enabled.map((s) => s.name).join('、')}`);
    const collected = [];
    for (const src of enabled) {
      console.log(`  → ${src.name} …`);
      const raw = await src.fetch();
      console.log(`     取得 ${raw.length} 笔`);
      collected.push(...raw.map((r) => normalize(r, src.id)));
    }

    // ★ 去重：同一公演可能被多个源报到。以 slug 为键，**后到的源覆盖先到的**
    //   —— 所以 SOURCES 的顺序就是优先级（越靠后越权威）。
    //   这个约定必须写下来：否则不同人加的源会以「谁先跑完」决定内容，
    //   而并发抓取下这是随机的，表现为数据在多次运行之间漂移。
    const bySlug = new Map();
    for (const s of collected) bySlug.set(s.slug, s);
    const merged = [...bySlug.values()];

    const { series, venues } = readData();
    const { errors, warnings } = validate({ shows: merged, series, venues });
    if (errors.length) {
      console.error(`\n✗ 数据校验失败（${errors.length} 项），未写入：`);
      for (const e of errors) console.error('  · ' + e);
      process.exit(1);
    }
    if (warnings.length) {
      console.warn(`\n⚠ ${warnings.length} 项警告：`);
      for (const w of warnings.slice(0, 20)) console.warn('  · ' + w);
    }

    fs.writeFileSync(
      path.join(DATA_DIR, 'shows.json'),
      JSON.stringify(merged, null, 2) + '\n',
      'utf8',
    );
    console.log(`\n✓ 已写入 data/shows.json（${merged.length} 部公演）`);
  }

  // 无论哪种模式，都跑一次校验
  const data = readData();
  const { errors, warnings } = validate(data);

  console.log(`\n数据校验：${data.shows.length} 部公演 / ${data.series.length} 个系列 / ${data.venues.length} 个会場`);
  if (warnings.length) {
    console.log(`\n⚠ ${warnings.length} 项警告：`);
    for (const w of warnings) console.log('  · ' + w);
  }
  if (errors.length) {
    console.log(`\n✗ ${errors.length} 项错误：`);
    for (const e of errors) console.log('  · ' + e);
    process.exitCode = 1;
  } else {
    console.log('\n✓ 无错误');
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
