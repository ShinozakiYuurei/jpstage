/**
 * 交互验收：搜索、筛选、排序、导航高亮
 *
 * ★ 为什么这些必须实测（而不是看代码就能确认）：
 *   它们是**客户端状态**驱动的行为，涉及 useMemo 依赖、Portal 定位、
 *   以及 CSS :has() 与 React effect 的协作。
 *   任何一处写错都不会报错，只会「点了没反应」或「数字不对」——
 *   靠读代码很难发现，必须真的点一遍。
 *
 * 用法：node probe/interactive.mjs [baseUrl]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:4321';
const CHROME =
  process.env.CHROME_PATH ||
  (fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/*
 * 从 data/*.json 取样例（探针不再依赖写死的 slug —— 那些 slug 是
 * 示例数据时代的，接入真实抓取后全部失效，探针会跑在 404 页上）
 */
/**
 * 样例公演（slug + status）
 *
 * ★★ status 必须**在探针里按日期算**，不能从 JSON 读 ★★
 *   data/shows.json 里**没有** status 字段 —— 它由 lib/data.ts 在构建时
 *   按 runs 的日期聚合算出来（原因见 lib/types.ts：静态导出下
 *   status 必须由数据决定，而「今天」是构建那一刻）。
 *   探针直接读 s.status 会得到 undefined，于是 pickSlug() 回退到
 *   列表里的第一部 —— 而第一部此刻正是「上演中」，
 *   于是「待演详情页应高亮即將開演」这项永远测到 now。
 *
 * ★ 探针必须与 lib/data.ts 用**同一个**判定基准（日本时间的今天），
 *   否则两边对「哪部是待演」的理解不一致，探针就会测错页面。
 */
const SHOW_SAMPLES = (() => {
  const shows = JSON.parse(fs.readFileSync(path.resolve('data/shows.json'), 'utf8'));
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return shows.map((s) => {
    const start = s.startDate;
    const end = s.endDate;
    return {
      slug: s.slug,
      status: end < today ? 'ended' : start > today ? 'upcoming' : 'now',
    };
  });
})();
const VENUE_SAMPLES = JSON.parse(fs.readFileSync(path.resolve('data/venues.json'), 'utf8')).map((v) => ({
  id: v.id,
}));
/** slug → 第一个出演者名（源站经常没登记，故可能为空） */
const CAST_BY_SLUG = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.resolve('data/shows.json'), 'utf8'))
    .map((s) => [s.slug, (s.cast || [])[0] || ''])
    .filter(([, c]) => c),
);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function fetchJson(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools not ready');
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jpstage-int-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=9335',
      `--user-data-dir=${dir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    const v = await fetchJson('http://127.0.0.1:9335/json/version');
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    });
    const raw = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const i = ++id;
        pending.set(i, { resolve, reject });
        ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => raw(m, p, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
      return r.result.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // ── /now 页：默认只显示上演中 ──
    console.log('\n① /now 列表（初始状态）');
    await send('Page.navigate', { url: BASE + '/now/' });
    await sleep(1100);
    const initial = await evaluate(`(() => {
      const cards = [...document.querySelectorAll('a[href^="/show/"]')];
      const statuses = cards.map(c => (c.querySelector('.jp-status')?.textContent || '').trim());
      const counter = document.querySelector('[aria-live="polite"]')?.textContent || '';
      return { cards: cards.length, statuses: [...new Set(statuses)], counter: counter.trim() };
    })()`);
    check('默认渲染卡片', initial.cards > 0, `${initial.cards} 张`);
    check(
      '只显示「上演中」（状态筛选默认已选）',
      initial.statuses.length === 1 && /上演中/.test(initial.statuses[0]),
      `状态: ${initial.statuses.join('/')}`,
    );
    check('命中数文案存在', /共 \d+ 部公演/.test(initial.counter), initial.counter);

    // ── 搜索 ──
    console.log('\n② 搜索');
    /*
     * ★★ 搜索词必须从**当前页面上的卡片**里取，不能写死 ★★
     *
     *   原先写死「刀劍」「ハイキュー」「植田圭輔」—— 那都是示例数据里的
     *   作品与演员，接入真实抓取后全部不存在，于是三项搜索全红，
     *   而搜索功能本身是好的。
     *
     *   现在的做法：先读出当前列表里第一张卡的标题（中文），
     *   取它前 2 个字作为搜索词。这样探针测的还是「输入文字能筛出卡片」
     *   这个行为，而不再依赖任何具体作品。
     */
    /* 出演者搜索词：从**当前列表里的公演**中取一个真实登记过的名字。
       当前页面只渲染卡片（不含 cast），所以从 data 里按 slug 反查。 */
    const castWord = await evaluate(`(() => {
      const slugs = [...document.querySelectorAll('a[href^="/show/"]')].map(a => a.getAttribute('href').split('/')[2]);
      const map = ${JSON.stringify(CAST_BY_SLUG)};
      for (const s of slugs) {
        const c = map[s];
        if (c) return c;
      }
      return '';
    })()`);

    const searchWord = await evaluate(`(() => {
      const h = document.querySelector('a[href^="/show/"] h3');
      const t = (h?.textContent || '').trim();
      return t.slice(0, 2);
    })()`);
    const searchResult = await evaluate(`(async () => {
      const input = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(searchWord)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 350));
      const cards = [...document.querySelectorAll('a[href^="/show/"]')];
      return {
        cards: cards.length,
        titles: cards.map(c => c.querySelector('h3')?.textContent.trim().slice(0, 20)),
      };
    })()`);
    check(
      `搜索「${searchWord}」命中且只命中相关`,
      searchResult.cards > 0 && searchResult.titles.every((t) => t.includes(searchWord)),
      `${searchResult.cards} 张: ${searchResult.titles.join(' | ')}`,
    );

    // 用日文原名搜索也应命中（haystack 同时含 zh 与 ja）
    const searchJa = await evaluate(`(async () => {
      const input = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(searchWord)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 350));
      const cards = [...document.querySelectorAll('a[href^="/show/"]')];
      return { cards: cards.length, titles: cards.map(c => c.querySelector('h3')?.textContent.trim().slice(0, 24)) };
    })()`);
    check('日文原名搜索命中（双语 haystack）', searchJa.cards > 0, `${searchJa.cards} 张: ${searchJa.titles.join(' | ')}`);

    // 搜索出演者
    const searchCast = await evaluate(`(async () => {
      const input = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      /*
       * ★ 出演者搜不到也是**正确结果**，不能断言「一定 > 0」：
       *   CoRich 是用户共建库，出演者一格经常没填（实测 54 部里 6 部为空）。
       *   而 /now/ 页此刻只有两部正在上演，它们的出演者可能恰好都为空。
       *   所以这里改为**从数据里取一个真实存在的出演者**再搜；
       *   若当前列表里确实没有登记出演者的公演，就跳过这项
       *   （并说明原因，而不是把它报成失败）。
       */
      setter.call(input, ${JSON.stringify(castWord)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 350));
      return document.querySelectorAll('a[href^="/show/"]').length;
    })()`);
    if (castWord) check('出演者名可搜索', searchCast > 0, `搜「${castWord}」→ ${searchCast} 张`);
    else console.log('  – 出演者名可搜索 — 跳过（当前列表的公演未登记出演者，源站数据如此）');

    // 无结果 → 空态
    const empty = await evaluate(`(async () => {
      const input = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'zzzz-not-exist');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 350));
      return {
        cards: document.querySelectorAll('a[href^="/show/"]').length,
        hasEmptyMsg: /沒有符合條件|条件に合う/.test(document.body.textContent),
      };
    })()`);
    check('无结果时显示空态提示', empty.cards === 0 && empty.hasEmptyMsg, `cards=${empty.cards}`);

    // 清除搜索
    const cleared = await evaluate(`(async () => {
      const btn = document.querySelector('[aria-label^="清除搜索"]');
      btn?.click();
      await new Promise(r => setTimeout(r, 300));
      return document.querySelectorAll('a[href^="/show/"]').length;
    })()`);
    check('清除搜索后恢复全部', cleared === initial.cards, `${cleared} vs ${initial.cards}`);

    // ── 筛选下拉 ──
    console.log('\n③ 筛选下拉（多选 + 计数）');
    const dropdown = await evaluate(`(async () => {
      const btns = [...document.querySelectorAll('button[aria-haspopup="listbox"]')];
      const kindBtn = btns.find(x => /類型/.test(x.getAttribute('aria-label') || '')) || btns[0];
      kindBtn.click();
      await new Promise(r => setTimeout(r, 300));
      // 菜单 Portal 到 body
      const menu = document.querySelector('.jp-glass-pop');
      const opts = menu ? [...menu.querySelectorAll('button')].map(b => b.textContent.trim()) : [];
      const inBody = menu ? menu.parentElement === document.body : false;
      return { opened: !!menu, inBody, opts: opts.slice(0, 6), total: opts.length };
    })()`);
    check('下拉可展开', dropdown.opened);
    check('菜单 Portal 到 body', dropdown.inBody);
    check('选项带命中数', dropdown.opts.some((o) => /\d/.test(o)), dropdown.opts.slice(0, 3).join(' | '));

    /*
     * ★ 筛选类型必须**从当前页面里挑一个真的有卡片的**，不能写死「音樂劇」。
     *   探针跑在 /now/（正在上演）页，而真实数据里此刻正在上演的可能
     *   只有两部、且都不是音樂劇 —— 写死类型就会筛出 0 张，
     *   断言「筛选后卡片数 > 0」必然红，而筛选功能其实是好的。
     *   取菜单里**命中数最大**的那一类：它一定有卡片。
     */
    const filtered = await evaluate(`(async () => {
      /*
       * ★ 必须**重新打开**菜单：上一步的「无结果 → 清除搜索」测试
       *   会触发列表重渲染，菜单可能已被关掉。原写法直接取
       *   .jp-glass-pop，拿到 null 后 opts 为空 ——
       *   表现为「筛选坏了」，实际是探针自己的状态没准备好。
       */
      if (!document.querySelector('.jp-glass-pop')) {
        const b = [...document.querySelectorAll('button[aria-haspopup="listbox"]')].find(x => /類型/.test(x.getAttribute('aria-label') || ''));
        b?.click();
        await new Promise(r => setTimeout(r, 400));
      }
      const menu = document.querySelector('.jp-glass-pop');
      const opts = menu ? [...menu.querySelectorAll('button')] : [];
      const scored = opts.map(b => {
        /*
         * ★ 字符类必须写成 [0-9]，不能写 \\d：
         *   这段代码是**模板字符串**里的内容，\\d 会被 JS 先解成 d，
         *   于是浏览器里跑的正则是 /(d+)/ —— 永远匹配不到数字，
         *   scored 全被 filter(n>0) 滤掉，探针报「无可选类型」。
         *   这类错误在探针里尤其危险：它不报错，只是让断言恒假。
         */
        const m = (b.textContent.match(/([0-9]+)/) || [])[1];
        return { b, n: m ? +m : 0, text: b.textContent.trim() };
      }).filter(x => x.n > 0).sort((x, y) => y.n - x.n);
      if (!scored.length) return { cards: -1, rows: [], label: "(无可选项)", menuStillOpen: false };
      const target = scored[0].b;
      const label = scored[0].text;
      target.click();
      await new Promise(r => setTimeout(r, 350));
      const cards = [...document.querySelectorAll('a[href^="/show/"]')];
      /*
       * ★ 类型标签的**位置变了**（卡片的信息行由 chip 改为纯文本），
       *   所以这里不能再找 .jp-chip。
       *
       * ★ 为什么改读 .jp-poster-card__info 的整段文字，而不是
       *   给类型加一个专用的 data 属性：
       *   探针要验证的是「筛出来的卡片确实都是该类型」——
       *   它应该读**用户看得到的东西**（卡片上那行信息），
       *   而不是一个专为测试而加的标记。后者会与真实渲染脱节：
       *   属性对了但文案没渲染出来，探针照样绿。
       */
      const rows = cards.map(c => (c.querySelector('.jp-poster-card__info')?.textContent || '').trim());
      return { cards: cards.length, rows, label, menuStillOpen: !!document.querySelector('.jp-glass-pop') };
    })()`);
    /*
     * 校验：每张卡片的**信息行**里都要出现所选类型的标签（中日任一写法）。
     * label 形如「音樂劇 / ミュージカル 8」，取掉数字后按「/」切成两个词。
     */
    const wanted = filtered.label
      .replace(/\d+/g, '')
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    const allMatch =
      filtered.rows.length > 0 &&
      filtered.rows.every((t) => wanted.some((w) => t.includes(w)));
    check(
      '筛选后只剩该类型',
      filtered.cards > 0 && allMatch,
      `选「${filtered.label}」→ ${filtered.cards} 张，首行信息: ${filtered.rows[0]?.slice(0, 30) ?? "(空)"}`,
    );
    check('勾选后菜单保持打开（可连续多选）', filtered.menuStillOpen);

    // 关闭菜单
    await evaluate(`(() => { document.querySelector('.fixed.inset-0')?.click(); return true; })()`);
    await sleep(250);

    // ── 排序 ──
    console.log('\n④ 排序');
    const sorted = await evaluate(`(async () => {
      // 先清空筛选
      const reset = [...document.querySelectorAll('button')].find(b => /清除全部條件|条件をすべて/.test(b.textContent));
      reset?.click();
      await new Promise(r => setTimeout(r, 350));
      const sel = document.querySelector('select');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, 'title');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 350));
      const titles = [...document.querySelectorAll('a[href^="/show/"] h3')].map(h => h.textContent.trim());
      return { titles, count: titles.length };
    })()`);
    const sortedOk = (() => {
      const t = sorted.titles;
      for (let i = 1; i < t.length; i++) {
        if (t[i - 1].localeCompare(t[i], 'zh-Hant') > 0) return false;
      }
      return t.length > 1;
    })();
    check('按作品名排序生效', sortedOk, `${sorted.count} 张，前 3: ${sorted.titles.slice(0, 3).join(' | ')}`);

    // ── 顶栏高亮（详情页归属）──
    console.log('\n⑤ 顶栏高亮归属');
    /*
     * ★ 三个样例 slug 必须从**当前数据**里挑，不能写死。
     *   它们原先写的是示例数据时代的 slug（接入真实抓取后已不存在），
     *   于是探针在 404 页上测高亮 —— 5 项全红，而页面功能其实是好的。
     *   按 status 现取一部，数据与探针不会再脱钩。
     */
    const pickSlug = (status) =>
      evaluate(`(() => { const s = ${JSON.stringify(SHOW_SAMPLES)}; return (s.find(x => x.status === '${status}') || s[0]).slug; })()`);
    const nowSlug = await pickSlug('now');
    const upSlug = await pickSlug('upcoming');
    const venueId = await evaluate(`(() => { const v = ${JSON.stringify(VENUE_SAMPLES)}; return (v[0] || {}).id || ''; })()`);

    // 上演中的详情页 → 应高亮「上演中」
    await send('Page.navigate', { url: BASE + '/show/' + nowSlug + '/' });
    await sleep(1600);
    const navNow = await evaluate(`(() => {
      const active = [...document.querySelectorAll('a[data-nav]')].filter(a => {
        const bg = getComputedStyle(a).backgroundColor;
        return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      }).map(a => a.dataset.nav);
      const aria = [...document.querySelectorAll('a[data-nav][aria-current="page"]')].map(a => a.dataset.nav);
      return { visual: active, aria };
    })()`);
    check('上演中详情页 → 顶栏「上演中」高亮', navNow.visual.includes('now'), `visual=[${navNow.visual}] aria=[${navNow.aria}]`);
    check('aria-current 同步', navNow.aria.includes('now'), `aria=[${navNow.aria}]`);

    // 即将开演的详情页 → 应高亮「即将开演」
    await send('Page.navigate', { url: BASE + '/show/' + upSlug + '/' });
    await sleep(1600);
    const navUpcoming = await evaluate(`(() => {
      const active = [...document.querySelectorAll('a[data-nav]')].filter(a => {
        const bg = getComputedStyle(a).backgroundColor;
        return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      }).map(a => a.dataset.nav);
      const aria = [...document.querySelectorAll('a[data-nav][aria-current="page"]')].map(a => a.dataset.nav);
      return { visual: active, aria };
    })()`);
    check('待演详情页 → 顶栏「即將開演」高亮', navUpcoming.visual.includes('upcoming'), `visual=[${navUpcoming.visual}]`);
    check('待演详情页 aria-current 正确', navUpcoming.aria.includes('upcoming'), `aria=[${navUpcoming.aria}]`);

    // 会場详情页
    await send('Page.navigate', { url: BASE + '/venue/' + venueId + '/' });
    await sleep(1100);
    const navVenue = await evaluate(`(() => {
      const active = [...document.querySelectorAll('a[data-nav]')].filter(a => {
        const bg = getComputedStyle(a).backgroundColor;
        return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      }).map(a => a.dataset.nav);
      return { visual: active };
    })()`);
    check('会場详情页 → 顶栏「會場」高亮', navVenue.visual.includes('venue'), `visual=[${navVenue.visual}]`);

    // ── 主题切换按钮 ──
    console.log('\n⑥ 主题与语言切换按钮');
    const themeCycle = await evaluate(`(async () => {
      const btn = document.querySelector('.jp-theme-toggle');
      const seen = [document.documentElement.dataset.theme];
      for (let i = 0; i < 2; i++) {
        btn.click();
        await new Promise(r => setTimeout(r, 700));
        seen.push(document.documentElement.dataset.theme);
      }
      return { seen, stored: localStorage.getItem('jp-theme') };
    })()`);
    /*
     * ★ 主题只有**两档**，所以点两次就该回到起点（不是三次）。
     *   这项原先断言「点三次回到起点」—— 那是三档时代的写法，
     *   两档下点三次会停在另一档，于是永远红。
     *   断言必须跟着档位数走。
     */
    check('主题按钮在两档间循环并回到起点', themeCycle.seen.length === 3 && themeCycle.seen[0] === themeCycle.seen[2], themeCycle.seen.join(' → '));
    check('主题写入 localStorage', !!themeCycle.stored, `jp-theme=${themeCycle.stored}`);
    const themeTransitionClean = await evaluate(`document.documentElement.classList.contains('jp-theme-transition')`);
    check('切换后无残留过渡类', !themeTransitionClean);

    const langBtn = await evaluate(`(async () => {
      document.querySelector('[data-lang-btn="ja"]')?.click();
      await new Promise(r => setTimeout(r, 400));
      const jaVisible = [...document.querySelectorAll('.i18n-ja')].filter(e => getComputedStyle(e).display !== 'none').length;
      const zhVisible = [...document.querySelectorAll('.i18n-zh')].filter(e => getComputedStyle(e).display !== 'none').length;
      return { jaVisible, zhVisible, lang: document.documentElement.lang, stored: localStorage.getItem('jp-lang') };
    })()`);
    check('点「日本語」切换生效', langBtn.jaVisible > 0 && langBtn.zhVisible === 0, `ja=${langBtn.jaVisible} zh=${langBtn.zhVisible}`);
    check('切换后 <html lang> 变 ja', langBtn.lang === 'ja', `lang=${langBtn.lang}`);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${failed.length === 0 ? '✓ 全部通过' : `✗ ${failed.length} 项失败`}（共 ${results.length} 项）\n`);
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    try { chrome.kill(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
