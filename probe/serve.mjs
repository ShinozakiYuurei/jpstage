#!/usr/bin/env node
/**
 * 零依赖静态预览服务器
 *
 * ★ 为什么需要它（而不是 `npx serve` 或 python -m http.server）：
 *
 *   ① `npx serve` 每次都要联网下载，离线或网络差时不可用；
 *   ② 两者对 Next.js 静态导出的 **trailingSlash 语义**处理不同：
 *      `/show/xxx/` 需要映射到 `/show/xxx/index.html`，
 *      而 `/show/xxx` 需要 301 到带斜杠的版本（否则相对链接会错）。
 *      python 的 http.server 两者都做不对，`npx serve` 的行为随版本变化。
 *      探针脚本依赖「产物就是线上会发的东西」，所以映射规则必须自己确定。
 *
 * ★ 为什么刻意**不**做目录列表、不做压缩、不做缓存头：
 *   它是探针的配套工具，不是生产服务器。多一个行为就多一处
 *   「本地通过、线上不同」的可能 —— 那正是探针最该避免的事。
 *
 * 用法：node probe/serve.mjs [dir] [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'out');
const PORT = Number(process.argv[3] || 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

/**
 * URL → 文件路径
 *
 * ★ 映射顺序就是 Next.js 静态导出的实际产物布局：
 *     精确文件（/favicon.svg）
 *     → 目录下的 index.html（/show/xxx/ → /show/xxx/index.html）
 *     → 补 .html（/robots.txt 之外的 /about → /about.html）
 *   顺序不能颠倒：若先试 .html，`/show/xxx` 会命中不到而 404，
 *   而线上 nginx 的 try_files 正是这个顺序。
 */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  // 防目录穿越：规范化后必须仍在 DIR 之内
  const safe = path.normalize(clean).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(DIR, safe);

  if (!full.startsWith(DIR)) return null;

  try {
    if (fs.statSync(full).isFile()) return full;
  } catch {}
  try {
    if (fs.statSync(full).isDirectory()) {
      const idx = path.join(full, 'index.html');
      if (fs.existsSync(idx)) return idx;
    }
  } catch {}
  const withHtml = full + '.html';
  if (fs.existsSync(withHtml)) return withHtml;
  const withIndex = path.join(full, 'index.html');
  if (fs.existsSync(withIndex)) return withIndex;
  return null;
}

const server = http.createServer((req, res) => {
  const file = resolveFile(req.url || '/');

  if (!file) {
    const nf = path.join(DIR, '404.html');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : '404 Not Found');
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('500 ' + err.message);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': buf.length,
    });
    res.end(buf);
  });
});

if (!fs.existsSync(DIR)) {
  console.error(`目录不存在：${DIR}\n先跑 npm run build 生成产物。`);
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`预览 ${DIR}`);
  console.log(`  http://127.0.0.1:${PORT}/`);
});
