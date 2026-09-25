import type { MetadataRoute } from 'next';

/** 静态导出下路由处理器必须显式声明（理由见 app/sitemap.ts 的注释）。 */
export const dynamic = 'force-static';

/**
 * robots.txt
 *
 * ★ 为什么显式声明 sitemap：本站是静态导出，robots.txt 会作为文件
 *   放在站点根目录。声明 sitemap 的绝对地址能让爬虫少一步猜测
 *   （默认约定是 /sitemap.xml，但显式声明在子域/反代场景下更稳）。
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://jpstage.example';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
