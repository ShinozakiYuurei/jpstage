import Link from 'next/link';

/**
 * 404
 *
 * ★ 为什么这一页对本站特别重要（而不是一个通用的「页面不存在」）：
 *   2.5 次元公演的寿命很短（一档常只有 2~4 週），公演结束后页面仍然保留
 *   （见 lib/data.ts 里 getEndedShows 的说明），但**用户收藏/分享的链接
 *   可能指向一个从未收录过的 slug**（例如某部作品还没舞台化）。
 *   这时给一句「可能尚未收录」+ 两条明确出口，比一句干巴巴的 404
 *   有用得多 —— 它把「找不到」转成了「换个方式找」。
 *
 * ★ 静态导出下 404 的行为：Next.js 会生成 out/404.html，
 *   nginx 需要配置 error_page 404 /404.html 才会用到它
 *   （否则用户看到的是 nginx 的默认页）。这一点写在 README 的部署说明里。
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5 py-16 text-center">
      <p className="text-5xl font-bold tracking-tight text-fg-dim">404</p>
      <div className="space-y-1.5">
        <h1 className="text-lg font-semibold tracking-tight text-fg">
          <span className="i18n-zh">找不到這個頁面</span>
          <span className="i18n-ja">ページが見つかりません</span>
        </h1>
        <p className="text-sm text-fg-muted">
          <span className="i18n-zh">
            這個公演可能尚未收錄，或已被合併到其他頁面。
          </span>
          <span className="i18n-ja">
            この公演はまだ収録されていないか、別のページに統合された可能性があります。
          </span>
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/now" className="jp-btn-primary rounded-full px-4 py-2 text-xs font-semibold">
          <span className="i18n-zh">上演中的公演</span>
          <span className="i18n-ja">上演中の公演</span>
        </Link>
        <Link href="/" className="jp-btn-ghost rounded-full px-4 py-2 text-xs font-semibold">
          <span className="i18n-zh">回到首頁</span>
          <span className="i18n-ja">ホームへ</span>
        </Link>
      </div>
    </div>
  );
}
