import type { MetadataRoute } from 'next';
import { allShowSlugs, allSeriesIds, allVenueIds } from '@/lib/data';

/**
 * ★ 静态导出下 sitemap/robots 这类**路由处理器**必须显式声明 force-static。
 *
 *   原因：它们默认被视为「可能依赖请求」的动态路由，而 output: 'export'
 *   没有服务端可以按请求生成 —— 构建会直接报错：
 *     export const dynamic = "force-static" not configured on route
 *   Next.js 不会自动推断「这个 route 其实只读本地数据」，
 *   必须由开发者明确声明「它在构建期就能定稿」。
 *   这与页面不同：页面是「渲染」，route 是「处理请求」，
 *   默认语义就是动态的。
 */
export const dynamic = 'force-static';

/**
 * sitemap.xml
 *
 * ★ 为什么聚合站必须做 sitemap（而不是等搜索引擎自己发现）：
 *   本站的核心价值在**详情页**（每个公演一个页面），而它们只能从
 *   列表页的卡片链接到达。列表页默认只渲染部分结果（客户端筛选），
 *   爬虫不执行 JS 就看不到被筛掉的那些 —— 于是一大批详情页
 *   永远进不了索引。
 *   在 sitemap 里穷举全部 slug，是绕开这个问题最直接的办法。
 *   静态导出下它会生成 /sitemap.xml，nginx 直接发文件。
 *
 * ★ 为什么不带 lastModified：
 *   构建时间会被当成「内容更新时间」，而本站的公演数据是定期重抓的 ——
 *   每次重建都把所有 URL 标成「刚更新」，会让搜索引擎的
 *   lastModified 信号彻底失去意义（它会被当成噪音而忽略）。
 *   宁可不给，也不要给一个假的。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://jpstage.example';

  const staticPages = ['', '/now', '/upcoming', '/venue', '/series'].map((p) => ({
    url: `${base}${p}/`,
    changeFrequency: 'daily' as const,
    priority: p === '' ? 1 : 0.8,
  }));

  /* 详情页优先级略低于列表页：用户与爬虫都应该先经过列表页理解站点结构。
     0.7 而不是 0.5 —— 它们才是真正承载内容的页面。 */
  const shows = allShowSlugs().map((slug) => ({
    url: `${base}/show/${slug}/`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const venues = allVenueIds().map((id) => ({
    url: `${base}/venue/${id}/`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  const series = allSeriesIds().map((id) => ({
    url: `${base}/series/${id}/`,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticPages, ...shows, ...venues, ...series];
}
