'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ShowCard } from '@/components/ShowCard';
import type { ShowBrief, ShowStatus } from '@/lib/types';

const STATUS_WEIGHT: Record<ShowStatus, number> = { now: 0, upcoming: 1, ended: 2 };

/** 单次最多展示的命中卡片数；其余提示用户收窄关键词。 */
const MAX_RESULTS = 24;

/**
 * 首页搜索（覆盖全部公演，含已結束）
 *
 * ★ 为什么放首页：首页首屏只有「上演中 + 搜索」两件事 ——
 * 搜索覆盖上演中与即將開演，「现在能看的」一搜即得。
 * 已結束作品**不混进结果**，单独收在 /archive（檔案庫），
 * 那里的搜索/筛选（按結束日排）才是档案库语义。
 *
 * ★ 为什么不用 ShowExplorer：首页要的是「一个框 + 命中卡片」，
 * 六个筛选维度的面板属于列表页（/now、/upcoming），首页塞下
 * 它们会把首屏重新变成目录页 —— 与「首屏只留上演中 + 搜索」矛盾。
 */
export function SiteSearch({ briefs }: { briefs: ShowBrief[] }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  /** 只搜「现在能看的」；已結束归档案库，不与上演中混排。 */
  const active = useMemo(() => briefs.filter((b) => b.status !== 'ended'), [briefs]);
  const results = useMemo(() => {
    if (!q) return [];
    return active
      .filter((b) => b.haystack.includes(q))
      .sort(
        (a, b) =>
          STATUS_WEIGHT[a.status] - STATUS_WEIGHT[b.status] ||
          b.startDate.localeCompare(a.startDate),
      );
  }, [active, q]);
  const shown = results.slice(0, MAX_RESULTS);

  return (
    <section role="search" aria-label="站内搜索 / サイト内検索" className="jp-panel rounded-2xl p-4 sm:p-5">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-dim"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜作品、系列、出演者、会場 / 作品・シリーズ・出演者・会場で検索"
          aria-label="搜索 / 検索"
          className="w-full rounded-xl border border-hairline-strong bg-veil py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-dim focus:border-accent/60 focus:bg-veil-strong focus:outline-none"
        />
      </div>
      <p className="mt-2 text-xs text-fg-dim">
        <span className="i18n-zh">上演中與即將開演即搜即點；已結束的作品收在 </span>
        <span className="i18n-ja">上演中・開幕予定を検索。終了作品は </span>
        <Link
          href="/archive"
          className="underline decoration-dotted underline-offset-2 transition hover:text-fg"
        >
          <span className="i18n-zh">檔案庫</span>
          <span className="i18n-ja">アーカイブ</span>
        </Link>
        <span className="i18n-zh">。</span>
        <span className="i18n-ja"> へ。</span>
      </p>
      {q && (
        <div className="mt-4">
          <p className="text-xs text-fg-muted" aria-live="polite">
            <span className="i18n-zh">
              命中 <span className="font-semibold text-fg-soft">{results.length}</span> 部公演
              {results.length > shown.length ? '（只顯示前 ' + MAX_RESULTS + ' 部，請縮小關鍵字）' : ''}
            </span>
            <span className="i18n-ja">
              {results.length} 件ヒット
              {results.length > shown.length ? '（上位' + MAX_RESULTS + '件のみ表示）' : ''}
            </span>
          </p>
          {shown.length > 0 ? (
            <div className="jp-stagger mt-3 grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {shown.map((brief) => (
                <div key={brief.slug} className="h-full">
                  <ShowCard show={brief} />
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-fg-muted">
              <span className="i18n-zh">沒有符合的公演，試試更短的關鍵字。</span>
              <span className="i18n-ja">該当する公演はありません。キーワードを短くしてみてください。</span>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
