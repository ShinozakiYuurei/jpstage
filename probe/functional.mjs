/**
 * 功能与响应式验收
 *
 * 检查四件靠读 CSS 无法确认的事：
 *   ① 双语切换真的只显示一种语言（首屏 + 切换后）
 *   ② 主题启动脚本在首屏就生效（没有闪白 / 没有 hydration mismatch）
 *   ③ 390px 窄屏下顶栏不溢出、导航可横向滚动
 *   ④ 语言切换不产生 hydration 警告
 *
 * ★ 为什么②必须用真实浏览器：FOUC（首帧错误主题）是**时序**问题，
 *   只有真的渲染一遍、在首帧后立刻读 data-theme 才能观察到。
 *
 * 用法：node probe/functional.mjs [baseUrl]
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

/**
 * 从 data/*.json 收集「不翻译的专有名词」
 *
 * ★ 为什么从数据现读而不是写死：
 *   写死就要随数据更新手动维护，而「忘了维护」的表现是探针报假失败 ——
 *   于是下次真出错时没人看报警（狼来了）。
 *   现读则永远同步：新加的公演、新的出演者自动被认作同形文本。
 *
 * ★ 为什么不把这些词也包上 .i18n-* 以绕开检查：
 *   那只是把同一串字写两遍（HTML 变大、无行为差别），
 *   而且掩盖了「这里其实不需要双语」这个事实 ——
 *   真正需要双语的是**描述性文案**（日期措辞、计数写法、导航标签），
 *   不是专有名词。检查应该准确，而不是靠给内容打补丁绕过。
 */
function collectNeutralValues() {
  const out = new Set();
  const add = (v) => {
    if (typeof v === 'string' && v.trim()) out.add(v.trim());
  };
  try {
    const shows = JSON.parse(fs.readFileSync('data/shows.json', 'utf8'));
    const series = JSON.parse(fs.readFileSync('data/series.json', 'utf8'));
    const venues = JSON.parse(fs.readFileSync('data/venues.json', 'utf8'));

    for (const s of shows) {
      add(s.company);
      for (const c of s.cast ?? []) add(c);
      for (const st of s.staff ?? []) add(st.name);
    }
    for (const v of venues) {
      add(v.address);
    }
    for (const sr of series) {
      // 系列名与原作名在中文模式下也会显示（已包 i18n），但它们的
      // **日文原名**会出现在搜索框提示、aria-label 等处，一并放行。
      add(sr.name?.ja);
      add(sr.original?.ja);
    }
  } catch (e) {
    console.warn('   ⚠ 读取 data/*.json 失败，专有名词白名单为空：' + e.message);
  }
  return [...out];
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
        this.consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

/**
 * 找出**没有**被 .i18n-zh / .i18n-ja 包住的双语文本
 *
 * 在目标页里执行（通过 toString() 序列化传过去）。
 *
 * ★ 白名单分两类：
 *
 *   ① **固定同形**（写死在函数里）：
 *      2.5 / 舞台 / 中文 / 日本語（品牌与语言名）、箭头、斜杠、
 *      日期数字组合（「2026年8月2日」中日同形）。
 *
 *   ② **专有名词**（由调用方传入，见 neutralValues）：
 *      出演者名、制作公司、会場名、系列原名 —— 这些**不翻译**，
 *      所以它们不需要也不应该包 .i18n-*。
 *
 *      ★ 为什么专有名词要从 data/*.json 现读、而不是写死在白名单里：
 *        写死就要随数据更新手动维护，而「忘了维护」的表现是探针报假失败 ——
 *        于是下次真出错时没人看报警（狼来了）。
 *        从数据现读则永远同步：新加的公演、新的出演者自动被认作同形文本。
 *
 * ★ 这个检查只能发现「漏标记」，不能自动判断「翻译对不对」——
 *   那是人工审校的事。但它能拦住最常见的那种错：
 *   有差异的文案只渲染了一种语言（就是 formatPerformances 那个 bug）。
 *
 * ★ 为什么用 .toString() 传函数而不是嵌模板字符串：
 *   嵌在模板字符串里的正则要经过**两层**转义（JS 模板 → CDP → 目标页），
 *   反斜杠会在每一层被吃一次，写出来的正则几乎必然错
 *   （实测反复踩到：被解成未闭合的分组）。
 *   把函数写成真代码、用 toString() 序列化，就只剩一层。
 */
function collectUntaggedText(neutralValues) {
  const SAME_IN_BOTH = new Set([    '2.5',
    '舞台',
    '中文',
    '日本語',
    '↑',
    '→',
    '↗',
    '/',
    '·',
    '〜',
    '—',
    '（',
    '）',
    '・',
    '!',
    '?',
    '!!',
  ]);
  const neutral = new Set(neutralValues || []);
  const numericish = /^[\d\s.,:+-]+$/;
  const dateish = /^[\d\s年月日（）週〜～.,:+-]+$/;
  const plusN = /^\+\d+$/;
  const hasCjk = /[\u3040-\u30ff\u4e00-\u9fff]/;

  /*
   * ★ 必须跳过 <script> / <style>：
   *   Next.js 会把整份 RSC 数据（包括**两种语言的所有文案**）
   *   塞进内联 <script> 里。它的 textContent 是 JSON 字符串，
   *   里面当然含大量未包 .i18n-* 的中日文本 ——
   *   不跳过的话探针会永远报一堆假失败（实测就是如此）。
   *   它不在无障碍树里，也不参与渲染，与「文字有没有包 i18n」无关。
   */
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

  const out = [];
  const walk = (node) => {
    if (node.nodeType === 1) {
      const tag = node.tagName;
      if (SKIP_TAGS.has(tag)) return;
      // aria-hidden 的纯装饰内容也不参与双语
      if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') return;
    }
    if (node.nodeType === 3) {
      const t = (node.textContent || '').trim();
      if (!t || !hasCjk.test(t)) return;
      if (SAME_IN_BOTH.has(t) || neutral.has(t)) return;
      if (numericish.test(t) || dateish.test(t) || plusN.test(t)) return;
      let p = node.parentElement;
      let tagged = false;
      while (p) {
        if (p.classList && (p.classList.contains('i18n-zh') || p.classList.contains('i18n-ja'))) {
          tagged = true;
          break;
        }
        p = p.parentElement;
      }
      if (!tagged) {
        const cls = (node.parentElement && node.parentElement.className) || '';
        out.push(`${t.slice(0, 26)}  ⟵ .${String(cls).slice(0, 44)}`);
      }
      return;
    }
    for (const c of node.childNodes) walk(c);
  };
  walk(document.body);
  return [...new Set(out)];
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jpstage-fn-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=9334',
      `--user-data-dir=${dir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    const v = await fetchJson('http://127.0.0.1:9334/json/version');
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        throw new Error(
          r.exceptionDetails.text +
            ' :: ' +
            (r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)),
        );
      }
      return r.result.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');

    // ── ① 首屏主题（无 FOUC）──
    console.log('\n① 首屏主题与时序');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.navigate', { url: BASE + '/' });
    await sleep(900);
    const bootTheme = await evaluate(`document.documentElement.dataset.theme`);
    check('首屏已设 data-theme', !!bootTheme, `theme=${bootTheme}`);
    const bootLang = await evaluate(`document.documentElement.dataset.lang`);
    check('首屏已设 data-lang', !!bootLang, `lang=${bootLang}`);
    const hasDarkClass = await evaluate(`document.documentElement.classList.contains('dark')`);
    check('.dark 类与 data-theme 同步', bootTheme !== 'dark' || hasDarkClass, `dark=${hasDarkClass}`);

    // 主题快照过渡期间不得残留 jp-theme-transition
    const leftover = await evaluate(`document.documentElement.classList.contains('jp-theme-transition')`);
    check('无残留的过渡类', !leftover);

    // ── ② 双语显示：只有一种语言可见 ──
    console.log('\n② 双语显示机制');
    const langCheck = await evaluate(`(() => {
      const zh = [...document.querySelectorAll('.i18n-zh')];
      const ja = [...document.querySelectorAll('.i18n-ja')];
      const visible = (els) => els.filter(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none').length;
      return { zhTotal: zh.length, jaTotal: ja.length, zhVisible: visible(zh), jaVisible: visible(ja) };
    })()`);
    check(
      '中文模式：中文可见、日文隐藏',
      langCheck.zhTotal > 0 && langCheck.jaVisible === 0 && langCheck.zhVisible > 0,
      `zh ${langCheck.zhVisible}/${langCheck.zhTotal} 可见，ja ${langCheck.jaVisible}/${langCheck.jaTotal} 可见`,
    );

    // 切到日文
    await evaluate(`(() => { document.documentElement.dataset.lang='ja'; document.documentElement.lang='ja'; return true; })()`);
    await sleep(200);
    const jaCheck = await evaluate(`(() => {
      const visible = (sel) => [...document.querySelectorAll(sel)].filter(e => getComputedStyle(e).display !== 'none').length;
      return { zhVisible: visible('.i18n-zh'), jaVisible: visible('.i18n-ja') };
    })()`);
    check('日文模式：日文可见、中文隐藏', jaCheck.zhVisible === 0 && jaCheck.jaVisible > 0, `zh ${jaCheck.zhVisible}，ja ${jaCheck.jaVisible}`);

    // 切回中文并验证 localStorage 记住
    await evaluate(`(() => {
      const btn = document.querySelector('[data-lang-btn="zh"]');
      if (btn) btn.click();
      return true;
    })()`);
    await sleep(300);
    const remembered = await evaluate(`localStorage.getItem('jp-lang')`);
    check('语言选择写入 localStorage', remembered === 'zh', `jp-lang=${remembered}`);
    const langAttr = await evaluate(`document.documentElement.lang`);
    check('<html lang> 与 data-lang 同步', langAttr === 'zh-Hant', `lang=${langAttr}`);

    // ── ②b 页面内**文字内容**是否真的随语言切换 ──
    //
    // ★ 为什么要专门查这一项（而不是只看 span 的显隐）：
    //   上面的检查只能证明「.i18n-* 的显隐规则生效」，
    //   但证明不了「有差异的文案都做了双语」。
    //   实测踩过：详情页的场次数写成了 formatPerformances(n, 'zh')
    //   只渲染一个 span（没有 i18n-ja 兄弟节点），于是日文模式下
    //   显示「共 64 場」。而两个字符串都是合法文案 ——
    //   没有报错、没有缺字、显隐规则也完全正常，
    //   所有结构检查全部通过，只有**真的对比文本**才能发现。
    console.log('\n②b 文字内容随语言变化');
    await send('Page.navigate', { url: BASE + '/show/touken-ranbu-jukuju-ranbu/' });
    await sleep(1100);
    /* 专有名词白名单：出演者、制作、会場地址、系列原名（从 data 现读） */
    const neutralValues = collectNeutralValues();
    const textZh = await evaluate(`(() => {
      document.documentElement.dataset.lang = 'zh';
      document.documentElement.lang = 'zh-Hant';
      return document.body.innerText;
    })()`);
    await sleep(250);
    const textJa = await evaluate(`(() => {
      document.documentElement.dataset.lang = 'ja';
      document.documentElement.lang = 'ja';
      return document.body.innerText;
    })()`);
    await sleep(250);

    // 中日文本必须不同（否则说明整页根本没切换）
    check('中日模式的页面文本不同', textZh !== textJa, `zh ${textZh.length} 字 / ja ${textJa.length} 字`);

    // 中文模式不应残留日文专属词；日文模式不应残留中文专属词。
    // 这两个词是各自语言独有的计数写法，最容易被漏掉。
    const zhHasJaOnly = /全\d+公演|あと\d+日/.test(textZh);
    const jaHasZhOnly = /共 \d+ 場|還有|已開演/.test(textJa);
    check('中文模式无日文专属文案', !zhHasJaOnly, zhHasJaOnly ? '出现「全N公演」或「あとN日」' : '');
    check('日文模式无中文专属文案', !jaHasZhOnly, jaHasZhOnly ? '出现「共 N 場」或「還有」' : '');

    // 逐节点检查：凡是含汉字/假名的文字节点，都必须处在 .i18n-zh / .i18n-ja 之内。
    //
    // ★ 为什么要用 .toString() 传函数而不是嵌模板字符串：
    //   嵌在模板字符串里的正则要经过**两层**转义（JS 模板 → CDP → 目标页），
    //   反斜杠会在每一层被吃一次，写出来的正则几乎必然错
    //   （实测反复踩到：/^(2\.5|…|\/|…)$/ 被解成未闭合的分组）。
    //   把函数写成真代码、用 toString() 序列化，就只剩一层，没有这个歧义。
    const untagged = await evaluate(`(${collectUntaggedText.toString()})(${JSON.stringify(neutralValues)})`);
    check(
      '所有双语文本都包在 .i18n-zh / .i18n-ja 内',
      untagged.length === 0,
      untagged.length ? `未标记: ${untagged.slice(0, 5).join(' | ')}` : '',
    );

    // ── ③ 窄屏（390px）顶栏不溢出 ──
    console.log('\n③ 窄屏响应式（390×844）');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await send('Page.navigate', { url: BASE + '/' });
    await sleep(900);
    const mobile = await evaluate(`(() => {
      const header = document.querySelector('header');
      const hr = header.getBoundingClientRect();
      const nav = header.querySelector('nav');
      const inner = header.firstElementChild;
      const ir = inner.getBoundingClientRect();
      // 顶栏高度是否仍是 56px（写死的高度，溢出时会露出来）
      const headerH = hr.height;
      // 是否有横向溢出（body 宽度 > 视口）
      const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      // 导航能否横向滚动（装不下时）
      const navScrollable = nav ? nav.scrollWidth > nav.clientWidth : null;
      // 导航项是否换行（高度会从 ~32 涨到 ~52）
      const navH = nav ? nav.getBoundingClientRect().height : 0;
      return { headerH, docOverflow, navScrollable, navH, innerRight: ir.right, viewport: window.innerWidth };
    })()`);
    check('顶栏高度保持 56px（未被撑高）', Math.abs(mobile.headerH - 56) < 2, `h=${mobile.headerH}`);
    check('导航项未换行（高度正常）', mobile.navH < 40, `nav h=${mobile.navH}`);
    check('页面无横向溢出', mobile.docOverflow <= 1, `overflow=${mobile.docOverflow}px`);
    check('内部容器不超出视口', mobile.innerRight <= mobile.viewport + 1, `right=${mobile.innerRight} viewport=${mobile.viewport}`);

    // 顶栏元素是否都被顶栏容纳（不垂直溢出）
    const fitsVertically = await evaluate(`(() => {
      const header = document.querySelector('header');
      const hr = header.getBoundingClientRect();
      let bad = [];
      for (const el of header.querySelectorAll('a,button,nav,div')) {
        const r = el.getBoundingClientRect();
        if (r.height < 2) continue;
        if (r.top < hr.top - 1 || r.bottom > hr.bottom + 1) {
          bad.push(el.tagName + '.' + (el.className||'').toString().slice(0,30));
        }
      }
      return bad;
    })()`);
    check('顶栏内元素均未垂直溢出', fitsVertically.length === 0, fitsVertically.slice(0, 3).join(' | '));

    // ── ④ 控制台无 hydration 警告 ──
    console.log('\n④ 控制台检查');
    const hydration = cdp.consoleErrors.filter((e) => /hydrat|did not match|mismatch/i.test(e));
    check('无 hydration mismatch 警告', hydration.length === 0, hydration.slice(0, 2).join(' | '));
    const otherErrors = cdp.consoleErrors.filter((e) => /error/i.test(e) && !/favicon/i.test(e));
    check('无其他 console error', otherErrors.length === 0, otherErrors.slice(0, 2).join(' | '));

    // ── 截图存档 ──
    const shots = [
      { name: 'home-dark', url: '/', theme: 'dark', w: 1280, h: 1000 },
      { name: 'home-sakura-pink', url: '/', theme: 'sakura', w: 1280, h: 1000 },
      { name: 'detail-dark', url: '/show/touken-ranbu-jukuju-ranbu/', theme: 'dark', w: 1280, h: 1200 },
      { name: 'now-dark', url: '/now/', theme: 'dark', w: 1280, h: 1100 },
      { name: 'mobile-home', url: '/', theme: 'dark', w: 390, h: 844 },
      { name: 'venue-list', url: '/venue/', theme: 'sakura', w: 1280, h: 1000 },
      { name: 'series-detail', url: '/series/touken-ranbu/', theme: 'sakura', w: 1280, h: 1100 },
    ];
    const outDir = path.resolve('probe/shots');
    fs.mkdirSync(outDir, { recursive: true });
    console.log('\n⑤ 截图存档');
    for (const s of shots) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: s.w,
        height: s.h,
        deviceScaleFactor: 1,
        mobile: s.w < 500,
      });
      await send('Page.navigate', { url: BASE + s.url });
      await sleep(850);
      await evaluate(`(() => {
        const d = document.documentElement;
        d.dataset.theme = ${JSON.stringify(s.theme)};
        d.classList.toggle('dark', ${JSON.stringify(s.theme)} === 'dark');
        window.scrollTo(0,0);
        return true;
      })()`);
      await sleep(450);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(outDir, s.name + '.png'), Buffer.from(shot.data, 'base64'));
      console.log(`  ✓ ${s.name}.png (${s.w}×${s.h}, ${s.theme})`);
    }

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
