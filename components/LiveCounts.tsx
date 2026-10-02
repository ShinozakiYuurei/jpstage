'use client';

import { useEffect, useState } from 'react';

/**
 * 聚合计数的实时重算
 *
 * 「共 N 部上演中」里的 N 来自构建日快照（getMeta / 各列表长度），
 * 部署几天后会数进已落幕的公演。做法与 LiveShowGrid 相同：SSR 首帧
 * 渲染构建值（避免 hydration 抖动），挂载后按浏览器当前 JST 重算。
 *
 * ★ 调用方只传档期两端（spans），不传整份 show —— 几十部公演约 2KB，
 *   这是把计数搬进客户端实时重算的最小代价。
 */

export type DateSpan = { startDate: string; endDate: string };

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

function liveCount(spans: DateSpan[], status: 'now' | 'upcoming'): number {
  const today = todayJst();
  return spans.filter((s) =>
    status === 'now'
      ? s.startDate <= today && today <= s.endDate
      : s.startDate > today,
  ).length;
}

function useLiveCount(
  spans: DateSpan[],
  status: 'now' | 'upcoming',
  fallback: number,
): number {
  const [count, setCount] = useState(fallback);
  useEffect(() => {
    setCount(liveCount(spans, status));
  }, [spans, status]);
  return count;
}

/** 纯数字：嵌进现成的「共 N 部…」句式里 */
export function LiveCount({
  spans,
  status,
  fallback,
}: {
  spans: DateSpan[];
  status: 'now' | 'upcoming';
  fallback: number;
}) {
  return <>{useLiveCount(spans, status, fallback)}</>;
}

/** 會場列表卡片里的「· N 部上演中」：实时归零后整段消失 */
export function LiveVenueNow({ spans, fallback }: { spans: DateSpan[]; fallback: number }) {
  const count = useLiveCount(spans, 'now', fallback);
  if (count <= 0) return null;
  return (
    <>
      <span className="text-fg-faint"> · </span>
      <span style={{ color: 'var(--jp-st-now-fg)' }}>
        {count}
        <span className="i18n-zh"> 部上演中</span>
        <span className="i18n-ja"> 上演中</span>
      </span>
    </>
  );
}

/**
 * 會場详情句尾的「，其中 N 部正在上演」：放进外层 .i18n-zh / .i18n-ja
 * 里使用 —— 内层双语 span 会被外层按当前语言隐藏，不会重复显示。
 */
export function LiveNowSuffix({ spans, fallback }: { spans: DateSpan[]; fallback: number }) {
  const count = useLiveCount(spans, 'now', fallback);
  if (count <= 0) return null;
  return (
    <>
      <span className="i18n-zh">，其中 {count} 部正在上演</span>
      <span className="i18n-ja">（うち上演中 {count} 件）</span>
    </>
  );
}

/** 系列一覧卡片里的「· N 上演中 / · M 即將開演」：实时归零后整段消失 */
export function LiveSeriesChips({
  spans,
  fallbackNow,
  fallbackUpcoming,
}: {
  spans: DateSpan[];
  fallbackNow: number;
  fallbackUpcoming: number;
}) {
  const now = useLiveCount(spans, 'now', fallbackNow);
  const upcoming = useLiveCount(spans, 'upcoming', fallbackUpcoming);
  return (
    <>
      {now > 0 && (
        <>
          <span className="text-fg-faint">·</span>
          <span style={{ color: 'var(--jp-st-now-fg)' }}>
            {now}
            <span className="i18n-zh"> 上演中</span>
            <span className="i18n-ja"> 上演中</span>
          </span>
        </>
      )}
      {upcoming > 0 && (
        <>
          <span className="text-fg-faint">·</span>
          <span style={{ color: 'var(--jp-st-soon-fg)' }}>
            {upcoming}
            <span className="i18n-zh"> 即將開演</span>
            <span className="i18n-ja"> 開幕予定</span>
          </span>
        </>
      )}
    </>
  );
}
