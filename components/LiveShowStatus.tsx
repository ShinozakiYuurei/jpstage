'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ShowStatus } from '@/lib/types';

/**
 * 详情页状态的实时重算
 *
 * ===== 为什么需要这个组件 =====
 *
 * 本站是静态导出，lib/data.ts 的 TODAY_JST 在构建日定死，show.status
 * 是「构建那天」的快照。卡片网格已由 LiveShowGrid / ShowExplorer 在挂载后
 * 重算，但详情页自身的状态标记（徽章、面包屑、开演倒数、顶栏归属
 * data-page-nav）还停在构建值 —— 部署几天后，已落幕的公演仍标着
 * 「上演中」，顶栏也继续亮着「上演中」。
 *
 * ===== 做法与 LiveShowGrid 相同：SSR 用构建值，挂载后重算 =====
 *
 * 首帧渲染构建日的 status，避免 hydration 抖动；挂载后按浏览器当前
 * JST 重算一次，四个消费点（article / 面包屑 / 徽章 / 倒计时）一致翻转。
 *
 * ★ 为什么不 import lib/data：它会把整份 JSON 拉进客户端 bundle
 *   （理由同 LiveShowGrid）。状态判定只有三行，就地重写。
 */

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

function computeStatus(startDate: string, endDate: string): ShowStatus {
  const today = todayJst();
  if (endDate < today) return 'ended';
  if (startDate > today) return 'upcoming';
  return 'now';
}

/** 挂载后按实时 JST 重算；SSR 与首帧返回构建值 */
function useLiveShowStatus(
  startDate: string,
  endDate: string,
  buildStatus: ShowStatus,
): ShowStatus {
  const [status, setStatus] = useState<ShowStatus>(buildStatus);
  useEffect(() => {
    setStatus(computeStatus(startDate, endDate));
  }, [startDate, endDate]);
  return status;
}

/**
 * 详情页 <article>：data-page-nav 挂载后按实时状态改写。
 *
 * 视觉高亮（globals.css 的 body:has([data-page-nav=…])）随属性自动跟进；
 * aria-current 由 NavLinks 监听同一属性的变化后补写。
 */
export function LiveShowArticle({
  startDate,
  endDate,
  status,
  accentChannels,
  children,
}: {
  startDate: string;
  endDate: string;
  status: ShowStatus;
  /** hexToChannels(show.accent) 的结果，主色通道值（氛围色与卡片同源） */
  accentChannels: string;
  children: ReactNode;
}) {
  const live = useLiveShowStatus(startDate, endDate, status);
  const pageNav =
    live === 'now' ? 'now' : live === 'upcoming' ? 'upcoming' : undefined;
  return (
    <article
      {...(pageNav ? { 'data-page-nav': pageNav } : {})}
      style={{ '--jp-accent-rgb': accentChannels } as CSSProperties}
    >
      {children}
    </article>
  );
}

/** 状态徽章：落幕当晚会自动从「上演中」翻成「已結束」 */
export function LiveStatusChip({
  startDate,
  endDate,
  status,
}: {
  startDate: string;
  endDate: string;
  status: ShowStatus;
}) {
  const live = useLiveShowStatus(startDate, endDate, status);
  return (
    <span
      className={
        live === 'now'
          ? 'jp-status jp-status--now'
          : live === 'upcoming'
            ? 'jp-status jp-status--upcoming'
            : 'jp-status'
      }
    >
      <span className="i18n-zh">
        {live === 'now' ? '上演中' : live === 'upcoming' ? '即將開演' : '已結束'}
      </span>
      <span className="i18n-ja">
        {live === 'now' ? '上演中' : live === 'upcoming' ? '開幕予定' : '終了'}
      </span>
    </span>
  );
}

/** 面包屑的分类链接：归属随实时状态在 /now ↔ /upcoming 间切换 */
export function LiveBreadcrumbStatus({
  startDate,
  endDate,
  status,
}: {
  startDate: string;
  endDate: string;
  status: ShowStatus;
}) {
  const live = useLiveShowStatus(startDate, endDate, status);
  return (
    <Link
      href={live === 'upcoming' ? '/upcoming' : '/now'}
      className="transition hover:text-fg"
    >
      <span className="i18n-zh">
        {live === 'upcoming' ? '即將開演' : live === 'now' ? '上演中' : '公演'}
      </span>
      <span className="i18n-ja">
        {live === 'upcoming' ? '開幕予定' : live === 'now' ? '上演中' : '公演'}
      </span>
    </Link>
  );
}

/** 只在「即将开演」时渲染的内容（开演倒数）。开演后自动消失。 */
export function LiveUpcomingOnly({
  startDate,
  endDate,
  status,
  children,
}: {
  startDate: string;
  endDate: string;
  status: ShowStatus;
  children: ReactNode;
}) {
  const live = useLiveShowStatus(startDate, endDate, status);
  if (live !== 'upcoming') return null;
  return <>{children}</>;
}

/** 檔期時間軸的狀態圓點：顏色跟著實時狀態走（構建值只保證首屏） */
export function LiveStatusDot({
  startDate,
  endDate,
  status,
}: {
  startDate: string;
  endDate: string;
  status: ShowStatus;
}) {
  const live = useLiveShowStatus(startDate, endDate, status);
  return (
    <span
      aria-hidden
      className="absolute -left-5 top-3.5 h-2.5 w-2.5 rounded-full border-2"
      style={{
        borderColor:
          live === 'now'
            ? 'var(--jp-st-now-dot)'
            : live === 'upcoming'
              ? 'var(--jp-st-soon-dot)'
              : 'var(--jp-st-end-dot)',
        background: 'var(--jp-canvas)',
      }}
    />
  );
}
