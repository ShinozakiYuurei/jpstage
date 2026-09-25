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
    const searchResult = await evaluate(`(async () => {
      const input = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '刀劍');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 350));
      const cards = [...document.querySelectorAll('a[href^="/show/"]')];
      return {
        cards: cards.length,
        titles: cards.map(c => c.querySelector('h3')?.textContent.trim().slice(0, 20)),
      };
    })()`);
    check(
      '搜索「刀劍」命中且只命中相关',
      searchResult.cards > 0 && searchResult.titles.every((t) => /刀劍|刀剣/.test(t)),
      `${searchResult.cards} 张: ${searchResult.titles.join(' | ')}`,
    );

    // 用日文原名搜索也应命中（haystack 同时含 zh 与 ja）
    const searchJa = await evaluate(`(async () => {
      const input = document.querySelector('input[type="search"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'ハイキュー');
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
      setter.call(input, '植田圭輔');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 350));
      return document.querySelectorAll('a[href^="/show/"]').length;
    })()`);
    check('出演者名可搜索', searchCast > 0, `${searchCast} 张`);

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
      const kindBtn = btns[0];
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

    // 选中「音樂劇」
    const filtered = await evaluate(`(async () => {
      const menu = document.querySelector('.jp-glass-pop');
      const target = [...menu.querySelectorAll('button')].find(b => /音樂劇/.test(b.textContent));
      target.click();
      await new Promise(r => setTimeout(r, 350));
      const cards = [...document.querySelectorAll('a[href^="/show/"]')];
      const chips = cards.map(c => c.querySelector('.jp-chip')?.textContent.trim());
      return { cards: cards.length, chips: [...new Set(chips)], menuStillOpen: !!document.querySelector('.jp-glass-pop') };
    })()`);
    check('筛选后只剩该类型', filtered.cards > 0 && filtered.cards < initial.cards && filtered.chips.every((c) => /音樂劇/.test(c)), `${filtered.cards} 张，类型: ${filtered.chips.join('/')}`);
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
    // 上演中的详情页 → 应高亮「上演中」
    await send('Page.navigate', { url: BASE + '/show/touken-ranbu-jukuju-ranbu/' });
    await sleep(1100);
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
    await send('Page.navigate', { url: BASE + '/show/blue-lock-4th-stage/' });
    await sleep(1100);
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
    await send('Page.navigate', { url: BASE + '/venue/imperial-theatre/' });
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
      for (let i = 0; i < 3; i++) {
        btn.click();
        await new Promise(r => setTimeout(r, 700));
        seen.push(document.documentElement.dataset.theme);
      }
      return { seen, stored: localStorage.getItem('jp-theme') };
    })()`);
    check('主题按钮循环三档并回到起点', themeCycle.seen.length === 4 && themeCycle.seen[0] === themeCycle.seen[3], themeCycle.seen.join(' → '));
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
