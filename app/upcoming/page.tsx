import type { Metadata } from 'next';
import { allShowSpans, getShowBriefs, getMeta } from '@/lib/data';
import { ShowExplorer } from '@/components/ShowExplorer';
import { LiveCount } from '@/components/LiveCounts';

export const metadata: Metadata = {
  title: '即將開演的公演',
  description:
    '日本 2.5 次元舞台劇、音樂劇即將開幕的公演一覽。含開幕日期、會場與售票資訊，可按類型與城市篩選。開幕予定の2.5次元舞台・ミュージカル公演一覧。',
};

/**
 * 即将开演（全部）
 *
 * ★ 为什么默认按开演日排序（而不是规模）：
 *   待演公演还没有场次数据（尚未开卖），「规模」这个指标不存在。
 *   而用户在此页的意图明确是「最近有什么要开演」——
 *   按开演日由近到远就是对这个意图最直接的回答。
 *
 * ★ 为什么不按月分组（hkmovie 的 upcoming 是按月的）：
 *   本站样本数据的待演公演横跨 2026-10 ~ 2027-03，按月分组会得到
 *   6 个只有 2~4 部的小节 —— 页面被标题切碎，扫读效率反而下降。
 *   而筛选器里的「排序」已经能让用户按需切换视角。
 *   （若将来数据量涨到每月十几部，再考虑改回分组。）
 */
export default function UpcomingPage() {
  const briefs = getShowBriefs();
  const meta = getMeta();
  const spans = allShowSpans();

  return (
    <>
      <section className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="i18n-zh">
            即將<span className="jp-grad-text">開演</span>
          </span>
          <span className="i18n-ja">
            開幕<span className="jp-grad-text">予定</span>
          </span>
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          {/* 计数挂载后按实时 JST 重算（LiveCounts），开演后自动归位 */}
          <span className="i18n-zh">
            共 <LiveCount
              spans={spans}
              status="upcoming"
              fallback={meta.counts.upcoming}
            />{' '}
            部公演等待開幕，按開幕日由近到遠排列。
          </span>
          <span className="i18n-ja">
            開幕を控えた公演が <LiveCount
              spans={spans}
              status="upcoming"
              fallback={meta.counts.upcoming}
            /> 件。開幕日の近い順に並んでいます。
          </span>
        </p>
      </section>

      <ShowExplorer
        briefs={briefs}
        initialStatus={['upcoming']}
        initialSort="start"
        searchPlaceholder={{ zh: '搜尋作品名、出演者、會場…', ja: '作品名・出演者・会場で検索…' }}
      />
    </>
  );
}
