import type { NextConfig } from 'next';

/**
 * 静态导出（output: 'export'）
 *
 * ★ 沿用 hkmovie 的取舍：本站数据是「批量抓取 → 构建 → 发静态文件」的形态，
 *   每个页面都不依赖请求期的用户态，所以完全不需要 Node 常驻进程。
 *   nginx 直接发 HTML，省掉一整块内存与运维面。
 *
 * ★ 代价（必须在数据层解决，不能靠服务端兜底）：
 *   · 没有 Image Optimization → 海报必须在**构建前**抓成本地文件
 *     （见 scripts/scrape.mjs 的 poster 阶段）。
 *   · 没有 ISR / 动态路由兜底 → 所有 [slug] 必须用 generateStaticParams
 *     穷举，漏一个就是构建期报错，不会留到线上才发现。
 */
const nextConfig: NextConfig = {
  output: 'export',

  // 静态导出产物目录。与 hkmovie 一致用 out/，便于部署脚本复用。
  distDir: 'out',

  // 详情页导出为 /show/xxx/index.html，nginx 直接命中，无需 try_files 重写。
  trailingSlash: true,

  images: {
    // ★ 静态导出下没有服务端优化器，必须关掉，否则图片 404。
    //   这不是放弃优化 —— 海报已在构建期由抓取脚本压成 WebP，
    //   真正的压缩发生在构建前，与 next/image 是否接管无关。
    unoptimized: true,
  },
};

export default nextConfig;
