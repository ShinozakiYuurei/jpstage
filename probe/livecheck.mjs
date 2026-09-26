// 线上实测：海报渲染 / 主题档位 / 4xx 资源
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] || 'https://jpstage.yuurei.de';
const CHROME = fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  : 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jplive-'));
const port = 9450;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${port}`, '--user-data-dir=' + dir, '--window-size=1280,1400', 'about:blank',
], { stdio: 'ignore' });

const fetchJson = async (u, n = 60) => { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch {} await sleep(250); } throw new Error('no devtools'); };

try {
  const v = await fetchJson(`http://127.0.0.1:${port}/json/version`);
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); } });
  const raw = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const i = ++id; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
  const { targetId } = await raw('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p) => raw(m, p, sessionId);
  const evaluate = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };

  await send('Page.enable');
  await send('Network.enable');
  const bad = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) bad.push(m.params.response.status + ' ' + m.params.response.url.slice(0, 90));
  });

  await send('Page.navigate', { url: BASE + '/' });
  await sleep(5000);

  console.log('=== 海报（首页）===');
  console.log(JSON.stringify(await evaluate(`(() => {
    const out = [];
    for (const im of document.querySelectorAll('img')) {
      out.push({ src: (im.currentSrc||im.src).split('/').pop(), loaded: im.complete && im.naturalWidth > 0, size: im.naturalWidth+'x'+im.naturalHeight });
    }
    return { count: out.length, allLoaded: out.every(o => o.loaded), imgs: out.slice(0,3) };
  })()`), null, 1));
  console.log('骨架残留:', await evaluate(`document.querySelectorAll('.jp-skeleton').length`));

  console.log('\n=== 主题档位（点 4 次，每次等 1.5s 让过渡收尾）===');
  console.log(JSON.stringify(await evaluate(`(async () => {
    const btn = document.querySelector('.jp-theme-toggle');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 1500));
      seen.push(document.documentElement.dataset.theme + ' canvas=' + getComputedStyle(document.documentElement).backgroundColor);
      btn.click();
    }
    await new Promise(r => setTimeout(r, 1500));
    seen.push(document.documentElement.dataset.theme + ' canvas=' + getComputedStyle(document.documentElement).backgroundColor);
    return seen;
  })()`), null, 1));

  console.log('\n=== 4xx/5xx ===');
  console.log(bad.length ? bad.join('\n') : '(无)');
  ws.close();
} catch (e) { console.error('ERR', e.message); }
finally { chrome.kill(); process.exit(0); }
