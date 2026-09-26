// 最终确认：主题档位（等过渡完全收尾，每次 2.5s）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] || 'https://jpstage.yuurei.de';
const CHROME = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jpt-'));
const port = 9451;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, '--user-data-dir=' + dir, '--window-size=1280,1400', 'about:blank'], { stdio: 'ignore' });
const fj = async (u, n = 60) => { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch {} await sleep(250); } throw new Error('no'); };
try {
  const v = await fj(`http://127.0.0.1:${port}/json/version`);
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const p = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && p.has(m.id)) { const { resolve, reject } = p.get(m.id); p.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } });
  const raw = (method, params = {}, s) => new Promise((res, rej) => { const i = ++id; p.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params, ...(s ? { sessionId: s } : {}) })); });
  const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, pp) => raw(m, pp, sessionId);
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  await send('Page.enable');
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(4000);

  console.log('=== 主题档位（每次点完等 2.5s，确保过渡收尾）===');
  console.log(JSON.stringify(await ev(`(async () => {
    const btn = document.querySelector('.jp-theme-toggle');
    const out = [];
    for (let i = 0; i < 5; i++) {
      btn.click();
      await new Promise(r => setTimeout(r, 2500));
      out.push({
        click: i + 1,
        theme: document.documentElement.dataset.theme,
        canvas: getComputedStyle(document.documentElement).backgroundColor,
        transClass: document.documentElement.classList.contains('jp-theme-transition'),
        icon: (() => {
          const svgs = [...document.querySelectorAll('.jp-theme-toggle svg')];
          return svgs.filter(s => getComputedStyle(s).display !== 'none').length;
        })(),
      });
    }
    return out;
  })()`), null, 1));

  console.log('\n=== 三种图标各自显示条件 ===');
  console.log(JSON.stringify(await ev(`(() => {
    const svgs = [...document.querySelectorAll('.jp-theme-toggle svg')];
    return svgs.map(s => ({ cls: s.className.baseVal || s.getAttribute('class'), display: getComputedStyle(s).display }));
  })()`), null, 1));

  console.log('\n=== 全站还有 light 主题残留吗 ===');
  console.log(JSON.stringify(await ev(`(() => {
    let n = 0;
    for (const sheet of document.styleSheets) {
      try { for (const r of sheet.cssRules) { if (r.cssText && r.cssText.includes("data-theme='light'")) n++; } } catch {}
    }
    return { lightRulesInCSS: n };
  })()`), null, 1));

  ws.close();
} catch (e) { console.error('ERR', e.message); } finally { chrome.kill(); process.exit(0); }
