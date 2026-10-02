'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ShowCardData, ShowStatus } from '@/lib/types';
import { LiveShowGrid } from './LiveShowGrid';
import { T } from './T';
import { formatPeriod } from '@/lib/format';

/**
 * 系列页的「上演中 / 即將開演 / 已結束」实时分组
 *
 * ===== 为什么分组也要进客户端 =====
 *
 * 分组原本在服务端按构建日 status 算好：卡片徽章交给 LiveShowGrid
 * 重算后，一部公演若在部署后落幕，会从「上演中」网格里消失，
 * 但标题下仍挂着构建日的「N 部」，分组还可能整组空掉 —— 计数说 1、
 * 网格空空。把分组搬进客户端后，归属、计数、网格三者同源。
 *
 * SSR 首帧用构建值分组（与原服务端输出一致，无 hydration 抖动）；
 * 挂载后按实时 JST 重分一次。已結束是终态，不会回流到前面的分组。
 */

export function LiveShowGroups({ shows }: { shows: ShowCardData[] }) {
  const [todayJst, setTodayJst] = useState<string | null>(null);
  useEffect(() => {
    setTodayJst(new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10));
  }, []);

  const groups = useMemo(() => {
    const statusOf = (s: ShowCardData): ShowStatus => {
      if (!todayJst) return s.status;
      return s.endDate < todayJst ? 'ended' : s.startDate > todayJst ? 'upcoming' : 'now';
    };
    return [
      {
        key: 'now' as const,
        zh: '上演中',
        ja: '上演中',
        items: shows.filter((s) => statusOf(s) === 'now'),
      },
      {
        key: 'upcoming' as const,
        zh: '即將開演',
        ja: '開幕予定',
        items: shows.filter((s) => statusOf(s) === 'upcoming'),
      },
      {
        key: 'ended' as const,
        zh: '已結束',
        ja: '終了',
        items: shows.filter((s) => statusOf(s) === 'ended'),
      },
    ].filter((g) => g.items.length > 0);
  }, [shows, todayJst]);

  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-2.5">
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              <span className="i18n-zh">{g.zh}</span>
              <span className="i18n-ja">{g.ja}</span>
            </h2>
            <span className="ml-auto text-xs text-fg-dim">
              {g.items.length}
              <span className="i18n-zh"> 部</span>
              <span className="i18n-ja"> 件</span>
            </span>
          </div>

          {/* 分组已实时，mode='all' 只重算徽章；'now'/'upcoming' 再兜一层过滤 */}
          <LiveShowGrid shows={g.items} mode={g.key === 'ended' ? 'all' : g.key} />

          {/* 已结束的分组附上期间一览：用户常需要确认「上一部演到什么时候」 */}
          {g.key === 'ended' && (
            <ul className="mt-3 space-y-1 text-xs text-fg-dim">
              {g.items.map((s) => (
                <li key={s.slug} className="flex flex-wrap gap-x-2">
                  <span className="text-fg-soft">
                    <T t={s.title} />
                  </span>
                  <span className="tabular-nums">
                    {/* 中日同形，一次渲染即可 */}
                    {formatPeriod(s.startDate, s.endDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
