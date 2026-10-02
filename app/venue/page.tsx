import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllVenues, getShowsByVenue, getVenueStats } from '@/lib/data';
import { cityLabel, prefLabel } from '@/lib/i18n';
import { T } from '@/components/T';
import { LiveVenueNow } from '@/components/LiveCounts';

export const metadata: Metadata = {
  title: '會場一覽',
  description:
    '日本 2.5 次元舞台劇、音樂劇的主要上演會場一覽。含都道府県、座席数與各會場的公演件數。2.5次元舞台・ミュージカルの主要会場一覧。',
};

/**
 * 会場一覧
 *
 * ★ 为什么按城市分组而不是按座席数排序：
 *   用户找会場的意图几乎总是「我要去東京/大阪，那里有什么会場」——
 *   地理是首要维度。座席数是**会場之间比较**的指标，属于次级信息，
 *   放在卡片里而不是排序依据。
 *
 * ★ 为什么城市分组顺序不是字母序：
 *   按「该城市的公演数」降序 —— 東京必然第一（绝大多数公演在此），
 *   这符合用户对「主要城市」的直觉。字母序会把「京都」排到「東京」前面，
 *   那对用户毫无意义（没有人在意五十音顺序）。
 */
export default function VenueListPage() {
  const venues = getAllVenues();

  /* 按城市聚合，并按公演数降序排城市 */
  const byCity = new Map<string, typeof venues>();
  for (const v of venues) {
    const list = byCity.get(v.city);
    if (list) list.push(v);
    else byCity.set(v.city, [v]);
  }
  const groups = [...byCity.entries()]
    .map(([city, list]) => {
      const shows = list.reduce((n, v) => n + getVenueStats(v.id).shows, 0);
      return { city, list, shows };
    })
    .sort((a, b) => b.shows - a.shows);

  return (
    <>
      <section className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="i18n-zh">
            會<span className="jp-grad-text">場</span>
          </span>
          <span className="i18n-ja">
            会<span className="jp-grad-text">場</span>
          </span>
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          <span className="i18n-zh">
            共 {venues.length} 個會場，依城市分組。點擊可查看該會場的全部公演檔期。
          </span>
          <span className="i18n-ja">
            全 {venues.length} 会場を都市別にまとめました。クリックすると会場の全公演日程を表示します。
          </span>
        </p>
      </section>

      {groups.map((g) => (
        <section key={g.city} className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-2.5">
            <h2 className="text-lg font-semibold tracking-tight text-fg">
              <span className="i18n-zh">{cityLabel(g.city, 'zh')}</span>
              <span className="i18n-ja">{cityLabel(g.city, 'ja')}</span>
            </h2>
            <span className="ml-auto text-xs text-fg-dim">
              {g.list.length}
              <span className="i18n-zh"> 個會場 · </span>
              <span className="i18n-ja"> 会場 · </span>
              {g.shows}
              <span className="i18n-zh"> 部公演</span>
              <span className="i18n-ja"> 公演</span>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.list.map((v) => {
              const stats = getVenueStats(v.id);
              const venueShows = getShowsByVenue(v.id);
              return (
                <Link
                  key={v.id}
                  href={`/venue/${v.id}`}
                  className="jp-glass flex flex-col gap-1.5 rounded-2xl p-4"
                >
                  <h3 className="text-sm font-bold leading-snug tracking-tight text-fg">
                    <T t={v.name} />
                  </h3>
                  <p className="text-xs text-fg-dim">
                    <span className="i18n-zh">{prefLabel(v.pref, 'zh')}</span>
                    <span className="i18n-ja">{prefLabel(v.pref, 'ja')}</span>
                    {v.seats != null && (
                      <>
                        <span className="text-fg-faint"> · </span>
                        <span className="tabular-nums">
                          {v.seats}
                          <span className="i18n-zh"> 席</span>
                          <span className="i18n-ja"> 席</span>
                        </span>
                      </>
                    )}
                  </p>
                  <p className="mt-auto pt-1 text-xs font-medium text-fg-soft">
                    {stats.shows}
                    <span className="i18n-zh"> 部公演</span>
                    <span className="i18n-ja"> 公演</span>
                    {/* 上演中计数挂载后按实时 JST 重算，归零后整段消失 */}
                    <LiveVenueNow spans={venueShows} fallback={stats.now} />
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
