/**
 * 三主题 × 双语 对比度与玻璃效果验收
 *
 * ★ 为什么必须用真实浏览器实测，而不是读 CSS 算：
 *
 *   本站的文字都浮在**半透明玻璃**上，而玻璃身后是极光层 + 每张卡自己的
 *   主色层。也就是说，一段文字的最终对比度取决于：
 *     backdrop-filter 采样到了什么 × 玻璃底色 alpha × 主色层 alpha × 文字色
 *   前两项**无法从 CSS 静态推导** —— 它们取决于实际渲染时的合成结果。
 *   手算只能算出「玻璃自身的底色」，而那个数字在真实产物上是不成立的
 *   （hkmovie 就吃过这个亏：按实心卡片算出的 5.18:1，实测只有 4.32:1）。
 *
 *   所以这里的做法是：
 *     ① 用 CDP 打开真实产物（out/，静态导出的 HTML）
 *     ② 收集每个待测元素的**实际 computed color** 与它的屏幕位置
 *     ③ 把所有文字/图片隐藏后截图 —— 那些位置剩下的像素就是**真实的底**
 *     ④ 拿真实底与真实文字色算 WCAG 对比度
 *   全程不注入任何 CSS 覆盖，量到什么就是什么。
 *
 * ★ 为什么截图要再喂回浏览器解析：
 *   避免引入 pngjs / sharp 这类依赖。浏览器自己就能 drawImage + getImageData，
 *   而且它读的就是它渲染出来的那份像素，没有中间格式转换的误差。
 *
 * 用法：node probe/theme-contrast.mjs [baseUrl]
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

const VIEWPORT = { width: 1280, height: 1400 };
const THEMES = ['dark', 'sakura'];
const PAGES = [
  { name: 'home', url: '/' },
  /*
   * ★ 详情页的样例 slug 必须是**当前数据里真的存在**的。
   *   它原先写的是示例数据时代的 slug（接入真实抓取后已不存在），
   *   探针于是跑在 404 页上 —— 测出来的是「404」两个大字的对比度，
   *   而真正要看的详情页文字一个都没测到。
   *   这里改成从 data/shows.json 里取第一部，数据与探针不会再脱钩。
   */
  { name: 'detail', url: '/show/' + detailSlug() + '/' },
  { name: 'now', url: '/now/' },
];

/** 取一部当前数据里存在的公演（优先有海报的：详情页头部有主色层，
 *  那是最容易破线的位置，见 --jp-accent-panel 的注释） */
function detailSlug() {
  try {
    const shows = JSON.parse(fs.readFileSync(path.resolve('data/shows.json'), 'utf8'));
    const withPoster = shows.find((s) => s.poster);
    return (withPoster ?? shows[0]).slug;
  } catch {
    return 'unknown';
  }
}

/** 待测文字元素：类名 → 人类可读名。只取前几个，避免同一类测上百次 */
const TARGETS = [
  { sel: 'h3.text-fg', label: '卡片標題 fg', max: 3 },
  /*
   * 示意海报上的标题
   *
   * ★ 它**不在玻璃上**，而是压在自己画的渐变底上（见 components/PosterArt.tsx），
   *   所以上面那些基于 .text-fg-* 的检查盖不到它。
   *   而它的可读性完全取决于那个底的亮度 —— 实测已因调底走过四轮弯路，
   *   正是最容易破线的一处。必须单独列进来。
   *
   * ★ 字号 18px 且 font-weight 700：属于 WCAG 的「大文本」，
   *   阈值是 3.0 而不是 4.5。
   */
  { sel: '.line-clamp-5', label: '示意海報標題', max: 3 },
  { sel: '.text-fg-soft', label: '次級正文 soft', max: 4 },
  /*
   * dim 分成两个独立条目来测，而不是合并成一个：
   *
   * ★ 为什么必须拆：dim 在**不同底色**上的表现差很多 ——
   *   落在普通玻璃卡上是 ~5.5:1，而落在 .jp-chip 内部时，
   *   芯片自身那层 10% 白会把底再抬亮一档，同一段文字就掉到 4.2 附近。
   *   合并测量只会报出「最差的那个」，无法区分
   *   「dim 令牌本身不够亮」与「某个特定用法把底抬亮了」——
   *   而这两者的修法完全不同（改令牌 vs 改那个用法）。
   */
  { sel: '.jp-chip .text-fg-dim', label: 'dim（chip 內）', max: 3 },
  { sel: '.text-fg-dim:not(.jp-chip *)', label: '輔助說明 dim', max: 4 },
  { sel: '.text-fg-muted', label: '次級文字 muted', max: 4 },
  { sel: '.jp-chip', label: '藥丸標籤 chip', max: 3 },
  { sel: '.jp-status', label: '狀態徽章 status', max: 2 },
  /*
   * 演示提示条的徽章
   *
   * ★ 它**不**用 .jp-status（而是自己写 style），所以上面的选择器盖不到它。
   *   这正是「不用统一组件」的代价：脱离了组件的样式就不会被针对组件的
   *   检查覆盖。既然它是一块会被人读的文字，就必须单独列进来测。
   */
  { sel: 'aside[role="note"] > span:first-child', label: '演示徽章', max: 2 },
  { sel: 'footer p', label: '頁腳 dim', max: 2 },
];

// ── 最小 CDP 客户端 ────────────────────────────────────────────────
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
    return r.result.value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools not ready: ' + url);
}

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jpstage-probe-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=9333',
      `--user-data-dir=${userDataDir}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  const cleanup = () => {
    try { chrome.kill(); } catch {}
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  };

  try {
    const version = await fetchJson('http://127.0.0.1:9333/json/version');
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });
    const root = new CDP(ws);

    // 建一个 target 用来跑页面
    const { targetId } = await root.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await root.send('Target.attachToTarget', { targetId, flatten: true });

    // 走 session 的 CDP（flatten 模式下用 sessionId 路由）
    const sess = {
      send: (method, params = {}) => {
        const id = ++root.id;
        return new Promise((resolve, reject) => {
          root.pending.set(id, { resolve, reject });
          root.ws.send(JSON.stringify({ id, method, params, sessionId }));
        });
      },
      evaluate: async (expression) => {
        const r = await sess.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
        return r.result.value;
      },
    };

    await sess.send('Page.enable');
    await sess.send('Runtime.enable');
    await sess.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const rows = [];
    const glassRows = [];

    for (const page of PAGES) {
      await sess.send('Page.navigate', { url: BASE + page.url });
      await sleep(900);

      for (const theme of THEMES) {
        // 用与站点相同的方式切主题（data-theme + .dark 类）
        await sess.evaluate(`(() => {
          const d = document.documentElement;
          d.dataset.theme = ${JSON.stringify(theme)};
          d.classList.toggle('dark', ${JSON.stringify(theme)} === 'dark');
          d.dataset.lang = 'zh';
          window.scrollTo(0, 0);
          return true;
        })()`);
        await sleep(320);

        // ① 收集待测元素（实际 computed color + 位置）
        const samples = await sess.evaluate(`(() => {
          const targets = ${JSON.stringify(TARGETS)};
          const out = [];
          for (const t of targets) {
            let n = 0;
            for (const el of document.querySelectorAll(t.sel)) {
              if (n >= t.max) break;
              const r = el.getBoundingClientRect();
              if (r.width < 4 || r.height < 4) continue;
              if (r.bottom < 4 || r.top > ${VIEWPORT.height} - 4) continue;
              if (r.left < 2 || r.right > ${VIEWPORT.width} - 2) continue;
              // 视口外的元素截不到，跳过（否则采样到页面边缘的纯色）
              const cs = getComputedStyle(el);
              /*
               * ★ 跳过原生表单控件（<select> / <option> / <input>）：
               *   它们内部的文字颜色由**浏览器/操作系统**绘制，
               *   getComputedStyle 读到的 color 往往与实际渲染无关
               *   （实测原生 select 读到 fg=rgb(212,212,216) 而底也是同一色，
               *     算出 1.00:1 —— 那是探针的误报，不是页面的缺陷）。
               *   而且隐藏文字后，原生控件的下拉箭头与系统绘制的文字
               *   并不会消失，采样点也不准。这类元素本就该排除。
               */
              if (['SELECT', 'OPTION', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(el.tagName)) continue;
              /*
               * 采样点：元素的垂直中心、水平中心。
               *
               * ★ 为什么中心点就是「文字所在处的底」：
               *   下一步会把所有含文字的元素 visibility:hidden ——
               *   于是这个位置剩下的像素**就是**文字背后那一层。
               *   不需要去避开文字字形本身（它已经不存在了），
               *   也就不会出现「采样点恰好落在笔画上」的偏差。
               */
              out.push({
                label: t.label,
                sel: t.sel,
                x: Math.round(r.left + r.width * 0.5),
                y: Math.round(r.top + r.height * 0.5),
                color: cs.color,
                fontSize: cs.fontSize,
                fontWeight: cs.fontWeight,
                /* 元素自己的 class + 文字片段：失败时能直接定位到是哪一处用法 */
                where: (el.className || '').toString().slice(0, 60),
                text: (el.textContent || '').trim().slice(0, 18),
              });
              n++;
            }
          }
          return out;
        })()`);

        // ② 玻璃边缘可见性检查：沿卡片左边缘扫一条水平线，找最大亮度阶跃
        //
        // ★ 为什么不直接比「卡内一点 vs 卡外一点」：
        //   那两个点的亮度差可能来自**卡内内容**（海报、主色层、文字），
        //   而不是玻璃本身的边界 —— 于是量到的是「卡片里有东西」，
        //   而不是「玻璃能被看出来」。
        //   扫一条跨过边界的线并找最大阶跃，量到的就是**边缘本身**，
        //   这正是用户眼睛看到的那个东西。
        const glassCheck = await sess.evaluate(`(() => {
          const card = document.querySelector('.jp-glass');
          if (!card) return null;
          const r = card.getBoundingClientRect();
          if (r.width < 10 || r.left < 20) return null;
          const y = Math.round(r.top + r.height * 0.5);
          const x0 = Math.round(r.left - 16);
          const xs = [];
          for (let i = 0; i <= 32; i++) xs.push(x0 + i);
          return { edgeX: Math.round(r.left), y, xs };
        })()`);

        // ③ 隐藏所有文字与图片，截图 → 那些位置剩下的是「真实的底」
        await sess.evaluate(`(() => {
          for (const el of document.querySelectorAll('body *')) {
            const tag = el.tagName;
            if (tag === 'IMG' || tag === 'SVG' || tag === 'svg' || tag === 'CANVAS') {
              el.style.visibility = 'hidden';
            } else if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
              el.style.visibility = 'hidden';
            }
          }
          return true;
        })()`);
        await sleep(160);

        const shot = await sess.send('Page.captureScreenshot', { format: 'png' });

        // ④ 把截图喂回浏览器解析，采样像素
        const pixels = await sess.evaluate(`(async () => {
          const b64 = ${JSON.stringify(shot.data)};
          const img = new Image();
          img.src = 'data:image/png;base64,' + b64;
          await img.decode();
          const cv = document.createElement('canvas');
          cv.width = img.width; cv.height = img.height;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const pts = ${JSON.stringify(samples.map((s) => [s.x, s.y]))};
          const glass = ${JSON.stringify(glassCheck)};
          const all = pts.concat(glass ? glass.xs.map((x) => [x, glass.y]) : []);
          return all.map(([x, y]) => {
            const d = ctx.getImageData(Math.max(0,Math.min(cv.width-1,x)), Math.max(0,Math.min(cv.height-1,y)), 1, 1).data;
            return [d[0], d[1], d[2]];
          });
        })()`);

        // ⑤ 恢复可见性（下一轮重新收集）
        await sess.evaluate(`(() => {
          for (const el of document.querySelectorAll('body *')) el.style.visibility = '';
          return true;
        })()`);

        samples.forEach((s, i) => {
          const [r, g, b] = pixels[i];
          rows.push({ page: page.name, theme, ...s, bg: [r, g, b] });
        });
        if (glassCheck) {
          const line = pixels.slice(samples.length);
          glassRows.push({ page: page.name, theme, edgeX: glassCheck.edgeX, xs: glassCheck.xs, line });
        }
      }
    }

    // ── 计算对比度 ──
    const lum = ([r, g, b]) => {
      const f = (v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };
    const parse = (c) => {
      const m = c.match(/([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
      return m ? [+m[1], +m[2], +m[3]] : null;
    };

    console.log('\n═══ 玻璃边缘可见性（沿卡片左边缘扫线，找最大亮度阶跃）═══');
    console.log('  阶跃 = 跨过边缘那一刻的亮度变化；为 0 说明玻璃与画布分不出来。');
    for (const g of glassRows) {
      // 找最大相邻阶跃，并记录它落在哪个 x（应当恰好是卡片边缘附近）
      let best = { d: 0, x: 0 };
      for (let i = 1; i < g.line.length; i++) {
        const d = Math.abs(lum(g.line[i]) - lum(g.line[i - 1]));
        if (d > best.d) best = { d, x: g.xs[i] };
      }
      // 跨整条线的总变化：反映「卡内与卡外整体差多少」
      const total = Math.abs(lum(g.line[g.line.length - 1]) - lum(g.line[0]));
      const atEdge = Math.abs(best.x - g.edgeX) <= 3;
      const ok = best.d > 0.0025 || total > 0.01;
      console.log(
        `  ${ok ? '✓' : '✗'} ${g.page.padEnd(7)} ${g.theme.padEnd(7)} 最大阶跃 ${best.d.toFixed(4)} @x=${best.x}（边缘 x=${g.edgeX}${atEdge ? ' ✓' : ' ⚠ 不在边缘'}）· 全线差 ${total.toFixed(4)}`,
      );
    }

    console.log('\n═══ 文字对比度（真实合成底 × 真实 computed 文字色）═══');
    const worst = new Map();
    for (const row of rows) {
      const fg = parse(row.color);
      if (!fg) continue;
      const c = ratio(fg, row.bg);
      const key = row.label;
      const prev = worst.get(key);
      if (!prev || c < prev.c) {
        worst.set(key, { c, row });
      }
    }
    for (const [label, { c, row }] of [...worst.entries()].sort((a, b) => a[1].c - b[1].c)) {
      const big = parseFloat(row.fontSize) >= 18 || (parseFloat(row.fontSize) >= 14 && +row.fontWeight >= 700);
      const need = big ? 3.0 : 4.5;
      const ok = c >= need ? '✓' : '✗';
      console.log(
        `  ${ok} ${label.padEnd(18)} 最差 ${c.toFixed(2)}:1 (需 ${need}) · ${row.page}/${row.theme} · ${row.fontSize} w${row.fontWeight}`,
      );
      console.log(
        `      fg=rgb(${row.color}) bg=rgb(${row.bg})  ${row.text ? `「${row.text}」` : ''} .${row.where}`,
      );
    }

    console.log('\n═══ 余量检查（按主题分组，看是否有擦线项）═══');
    const byTheme = new Map();
    for (const row of rows) {
      const fg = parse(row.color); if (!fg) continue;
      const c = ratio(fg, row.bg);
      const big = parseFloat(row.fontSize) >= 18 || (parseFloat(row.fontSize) >= 14 && +row.fontWeight >= 700);
      const margin = c - (big ? 3.0 : 4.5);
      const prev = byTheme.get(row.theme);
      if (!prev || margin < prev.margin) byTheme.set(row.theme, { margin, c, label: row.label, where: row.where, text: row.text });
    }
    for (const [theme, v] of byTheme) {
      const flag = v.margin < 0.15 ? '⚠ 擦线' : '✓';
      console.log(`  ${flag} ${theme.padEnd(7)} 最小余量 ${v.margin.toFixed(2)}（${v.label} ${v.c.toFixed(2)}:1 · .${v.where}）`);
    }

    const fails = [...worst.entries()].filter(([, v]) => {
      const big = parseFloat(v.row.fontSize) >= 18 || (parseFloat(v.row.fontSize) >= 14 && +v.row.fontWeight >= 700);
      return v.c < (big ? 3.0 : 4.5);
    });
    console.log(`\n${fails.length === 0 ? '✓ 全部达标' : `✗ ${fails.length} 项不达标`}`);
    console.log(`共测 ${rows.length} 个采样点（${PAGES.length} 页 × ${THEMES.length} 主题）\n`);

    process.exitCode = fails.length ? 1 : 0;
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
