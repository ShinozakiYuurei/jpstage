'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ShowCardData, ShowStatus } from '@/lib/types';
import { ShowCard } from './ShowCard';

/** 过滤模式：'now' / 'upcoming' 按实时状态过滤；'all' 只重算徽章不过滤 */
type LiveMode = 'now' | 'upcoming' | 'all';

/**
 * 状态实时的公演卡片网格
 *
 * ===== 为什么需要这个组件 =====
 *
 * 本站是静态导出，lib/data.ts 的 TODAY_JST 在构建时定稿 ——
 * 首页的上演中/即将开演、會場頁、系列頁、詳情頁推薦里的卡片状态
 * 都是「构建那天」的快照。部署几天后，已结束的公演仍挂着「上演中」徽章，
 * 「上演中」区块里甚至混进了已结束、已开演的卡片。
 *
 * ===== 做法与 ShowExplorer 相同：SSR 用构建值，挂载后重算 =====
 *
 * 首屏 HTML 用构建时的 status（todayJst 为 null 时原样渲染 props），
 * 避免 hydration 抖动；挂载后按浏览器当前 JST 日期重算每张卡的 status，
 * 再按 mode 过滤：
 *   · mode='now'      → 剔除已转为 ended / upcoming 的卡片；
 *   · mode='upcoming' → 剔除已转为 now / ended 的卡片；
 *   · mode='all'      → 不过滤（列表本就按状态混合排序），只让徽章跟上现实。
 *
 * ★ 为什么数据以 props 传入而不在组件内 import lib/data.ts：
 *   与 ShowExplorer 同理 —— import 会把整份 JSON 打进客户端 bundle；
 *   由服务端经 toCardData 算好最小卡片数据传入，bundle 只含这几个字段。
 */
export function LiveShowGrid({
  shows,
  mode = 'all',
  gridClassName = 'grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5',
  priorityCount = 0,
  empty,
}: {
  shows: ShowCardData[];
  mode?: LiveMode;
  /** 网格列数随页面而异：首页是 md 4 列，详情/列表页是 lg 5 列 */
  gridClassName?: string;
  /** 前 N 张开图片 priority（只给首屏第一行，理由见 PosterImage.tsx） */
  priorityCount?: number;
  /** 实时过滤后一张不剩时显示的内容（如「目前沒有上演中的公演」） */
  empty?: React.ReactNode;
}) {
  const [todayJst, setTodayJst] = useState<string | null>(null);
  useEffect(() => {
    setTodayJst(new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10));
  }, []);

  const liveShows = useMemo(() => {
    if (!todayJst) return shows;
    return shows
      .map((s) => ({
        ...s,
        status: (s.endDate < todayJst
          ? 'ended'
          : s.startDate > todayJst
            ? 'upcoming'
            : 'now') as ShowStatus,
      }))
      .filter((s) => mode === 'all' || s.status === mode);
  }, [shows, mode, todayJst]);

  if (liveShows.length === 0) {
    return empty != null ? <>{empty}</> : null;
  }

  return (
    <div className={`jp-stagger ${gridClassName}`}>
      {liveShows.map((show, i) => (
        <div key={show.slug} style={{ '--i': i } as React.CSSProperties} className="h-full">
          <ShowCard show={show} priority={i < priorityCount} />
        </div>
      ))}
    </div>
  );
}
