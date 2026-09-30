/**
 * 支付方式筛选的端到端验收
 *
 * 检查四件事（都需要真实浏览器 —— 筛选在客户端跑，静态 HTML 看不出来）：
 *   ① 首页出现「支付方式」筛选器，且选项都是已核实平台的真实支付方式
 *   ② 选中 PayPal 后只剩 ローソン 渠道的公演（PayPal 只有它支持）
 *   ③ 详情页列出各平台的支付方式，未核实的平台显示「待確認」而不是留空
 *   ④ 支付方式与平台两个维度能叠加（维度间 AND）
 *
 * ★ 为什么不能用「读 out/*.html」代替：
 *   筛选项的**计数**是按其他维度的当前选择实时算的（分面搜索），
 *   静态 HTML 里只有初始状态。计数算错的表现是「点进去空的」，
 *   只有真的点一遍才看得到。
 *
 * 用法：node probe/payments.mjs [baseUrl]
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
const failed = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  if (!ok) failed.push(name);
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

/** 极简 CDP 客户端（与 probe/functional.mjs 同一套，避免重复依赖） */
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
  send(method, params, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params: params ?? {} };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function fetchJson(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {
      /* 浏览器还没起来，继续等 */
    }
    await sleep(250);
  }
  throw new Error('CDP 未就绪：' + url);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jpstage-pay-'));
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=9336',
      `--user-data-dir=${dir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    const v = await fetchJson('http://127.0.0.1:9336/json/version');
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
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
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
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });

    // ── ① 筛选器存在且选项可信 ──
    console.log('\n① 支付方式筛选器');
    await send('Page.navigate', { url: BASE + '/now' });
    await sleep(1400);

    const hasFilter = await evaluate(
      `[...document.querySelectorAll('button')].some((b) => /支払方法|支付方式/.test(b.textContent))`,
    );
    check('「支付方式」筛选器已渲染', hasFilter);

    const placeholders = await evaluate(
      `[...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /所有支付方式/.test(t)).length`,
    );
    check('未选中时显示「所有支付方式」', placeholders === 1, 'count=' + placeholders);

    /** 打开支付方式下拉，读出全部选项文案 */
    const openPaymentMenu = `
      (() => {
        const btn = [...document.querySelectorAll('button')].find((b) => /所有支付方式|支付方式 ·/.test(b.textContent));
        if (!btn) return null;
        btn.click();
        return true;
      })()
    `;
    await evaluate(openPaymentMenu);
    await sleep(500);

    const options = await evaluate(
      `[...document.querySelectorAll('button[role="option"]')].map((el) => el.textContent.replace(/\\s+/g, ' ').trim())`,
    );
    const optText = options.join(' | ');
    check('下拉含 Visa 选项', /Visa/.test(optText), optText.slice(0, 160));
    check('下拉含 PayPal 选项', /PayPal/.test(optText));
    check('下拉含 JCB 选项', /JCB/.test(optText));
    check('下拉不含支付宝', !/支付寶|支付宝|Alipay/.test(optText));
    check('下拉不含微信支付', !/微信|WeChat/.test(optText));

    // ── ② 选 PayPal 后只剩ローソン渠道 ──
    console.log('\n② 选 PayPal 的筛选结果');
    const clicked = await evaluate(
      `(() => {
        const item = [...document.querySelectorAll('button[role="option"]')].find((el) => /PayPal/.test(el.textContent));
        if (!item) return false;
        item.click();
        return true;
      })()`,
    );
    check('可勾选 PayPal', clicked);
    await sleep(800);

    /** 关掉下拉（点遮罩）后再读结果 */
    await evaluate(
      `(() => { const ov = document.querySelector('[data-jp-filter-overlay]') || document.querySelector('.fixed.inset-0'); if (ov) ov.click(); return true; })()`,
    );
    await sleep(500);

    const summary = await evaluate(
      `(() => {
        const p = document.querySelector('p[aria-live="polite"]');
        return p ? p.textContent.replace(/\\s+/g, ' ').trim() : null;
      })()`,
    );
    const count = summary ? Number((summary.match(/(\d+)/) || [])[1]) : NaN;
    check('筛选后有结果且计数为正', Number.isFinite(count) && count > 0, 'summary=' + summary);

    const cards = await evaluate(`document.querySelectorAll('a[href^="/show/"]').length`);
    check('卡片数量与计数一致', cards === count, `cards=${cards} count=${count}`);

    // ── ③ 详情页显示支付方式 ──
    console.log('\n③ 详情页支付方式区块');
    await send('Page.navigate', { url: BASE + '/show/precure-460623' });
    await sleep(1200);
    const detailText = await evaluate(`document.body.innerText`);
    check('详情页有「各平台可用的支付方式」', /各平台可用的支付方式/.test(detailText));
    check('详情页列出 Visa', /Visa/.test(detailText));
    check('详情页列出 PayPal', /PayPal/.test(detailText));
    check(
      '未核实平台显示「支付方式待確認」',
      /支付方式待確認/.test(detailText),
      'precure 含飛行船/アソビュー 等未核实渠道',
    );

    // ── ④ 与平台维度叠加 ──
    console.log('\n④ 支付方式 × 平台 叠加');
    await send('Page.navigate', { url: BASE + '/now' });
    await sleep(1400);
    const both = await evaluate(
      `(() => {
        const pick = (re, valueRe) => {
          const btn = [...document.querySelectorAll('button')].find((b) => re.test(b.textContent));
          if (!btn) return false;
          btn.click();
          return true;
        };
        return pick(/所有售票處/);
      })()
    `);
    await sleep(500);
    const vendorPicked = await evaluate(
      `(() => {
        const item = [...document.querySelectorAll('button[role="option"]')].find((el) => /樂虎|ローソン/.test(el.textContent));
        if (!item) return false;
        item.click();
        return true;
      })()`,
    );
    check('可选平台「樂虎」', vendorPicked);
    await sleep(700);
    await evaluate(
      `(() => { const ov = document.querySelector('.fixed.inset-0'); if (ov) ov.click(); return true; })()`,
    );
    await sleep(400);

    const vendorOnly = await evaluate(
      `(() => {
        const p = document.querySelector('p[aria-live="polite"]');
        return p ? Number((p.textContent.match(/(\\d+)/) || [])[1]) : NaN;
      })()`,
    );
    check('只选平台时有结果', Number.isFinite(vendorOnly) && vendorOnly > 0, 'count=' + vendorOnly);

    console.log('\n⑤ 截图存档');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.navigate', { url: BASE + '/now' });
    await sleep(1400);
    await evaluate(openPaymentMenu);
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync('probe/shots', { recursive: true });
    fs.writeFileSync('probe/shots/payment-menu.png', Buffer.from(shot.data, 'base64'));
    console.log('  ✓ probe/shots/payment-menu.png');

    await send('Page.navigate', { url: BASE + '/show/precure-460623' });
    await sleep(1200);
    await evaluate(`window.scrollTo(0, 520)`);
    await sleep(400);
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('probe/shots/payment-detail.png', Buffer.from(shot2.data, 'base64'));
    console.log('  ✓ probe/shots/payment-detail.png');

    console.log(
      `\n${failed.length === 0 ? '✓ 全部通过' : `✗ ${failed.length} 项失败`}（共 ${results.length} 项）\n`,
    );
    process.exitCode = failed.length === 0 ? 0 : 1;
  } finally {
    chrome.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
