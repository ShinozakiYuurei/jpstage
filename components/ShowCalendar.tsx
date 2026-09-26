'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FilterDropdown, type FilterOption } from '@/components/FilterDropdown';
import { formatPeriod } from '@/lib/format';
import { cityLabel } from '@/lib/i18n';
import type { CalendarEntry } from '@/lib/types';

const WEEKDAYS = {
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  ja: ['日', '月', '火', '水', '木', '金', '土'],
};

function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function monthDates(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const start = new Date(Date.UTC(year, monthNumber - 1, 1 - first.getUTCDay()));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dayCount = Math.ceil((first.getUTCDay() + daysInMonth) / 7) * 7;
  return Array.from({ length: dayCount }, (_, i) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);
    return toIsoDate(day);
  });
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year}年${monthNumber}月`;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function groupByShow(entries: CalendarEntry[]) {
  const groups = new Map<
    string,
    { slug: string; title: CalendarEntry['title']; entries: CalendarEntry[] }
  >();
  for (const entry of entries) {
    const group = groups.get(entry.slug) ?? { slug: entry.slug, title: entry.title, entries: [] };
    group.entries.push(entry);
    groups.set(entry.slug, group);
  }
  return [...groups.values()];
}

const ALL_CITIES = '__all__';

export function ShowCalendar({
  entries,
  today: buildToday,
}: {
  entries: CalendarEntry[];
  today: string;
}) {
  const [today, setToday] = useState(buildToday);
  const todayRef = useRef(buildToday);
  const initialMonth = today.slice(0, 7);
  const lastMonth = entries.reduce(
    (latest, entry) => (entry.endDate.slice(0, 7) > latest ? entry.endDate.slice(0, 7) : latest),
    initialMonth,
  );
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedCity, setSelectedCity] = useState(ALL_CITIES);
  const [dateSelectionRevision, setDateSelectionRevision] = useState(0);
  const detailsRef = useRef<HTMLElement>(null);
  const scrollDetailsOnDateChange = useRef(false);

  // 静态导出使用构建日期首屏；挂载后按日本时间校正，跨午夜也刷新今天标记。
  useEffect(() => {
    function refreshToday() {
      const current = toIsoDate(new Date(Date.now() + 9 * 3600_000));
      const previous = todayRef.current;
      if (current === previous) return;
      todayRef.current = current;
      setToday(current);
      setMonth((value) => (value <= current.slice(0, 7) ? current.slice(0, 7) : value));
      setSelectedDate((value) => (value === previous || value < current ? current : value));
    }
    refreshToday();
    const interval = window.setInterval(refreshToday, 60_000);
    document.addEventListener('visibilitychange', refreshToday);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshToday);
    };
  }, []);

  const cityOptions: FilterOption[] = useMemo(() => {
    const cities = [...new Set(entries.filter((entry) => entry.endDate >= today).map((entry) => entry.city).filter(Boolean))].sort((a, b) =>
      cityLabel(a, 'ja').localeCompare(cityLabel(b, 'ja'), 'ja'),
    );
    return [
      { value: ALL_CITIES, label: '所有城市 / すべての都市' },
      ...cities.map((city) => ({
        value: city,
        label: `${cityLabel(city, 'zh')} / ${cityLabel(city, 'ja')}`,
      })),
    ];
  }, [entries, today]);
  const filteredEntries = useMemo(
    () =>
      selectedCity === ALL_CITIES
        ? entries
        : entries.filter((entry) => entry.city === selectedCity),
    [entries, selectedCity],
  );
  const dates = useMemo(() => monthDates(month), [month]);
  const entriesByDay = useMemo(() => {
    const byDay = new Map<string, CalendarEntry[]>();
    for (const date of dates) {
      byDay.set(
        date,
        date < today
          ? []
          : filteredEntries
              .filter((entry) => entry.startDate <= date && entry.endDate >= date)
              .map((entry): CalendarEntry => ({
                ...entry,
                status: entry.startDate > today ? 'upcoming' : 'now',
              })),
      );
    }
    return byDay;
  }, [dates, filteredEntries, today]);

  const selectedEntries = entriesByDay.get(selectedDate) ?? [];
  const selectedShows = useMemo(() => groupByShow(selectedEntries), [selectedEntries]);

  useEffect(() => {
    if (!scrollDetailsOnDateChange.current) return;
    scrollDetailsOnDateChange.current = false;
    if (!window.matchMedia('(max-width: 639px)').matches) return;
    const frame = window.requestAnimationFrame(() => {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth';
      detailsRef.current?.scrollIntoView({ behavior, block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dateSelectionRevision, selectedDate]);

  function selectDate(date: string) {
    scrollDetailsOnDateChange.current = true;
    setSelectedDate(date);
    setDateSelectionRevision((revision) => revision + 1);
  }

  function selectCity(values: string[]) {
    const nextCity = values[0] ?? ALL_CITIES;
    const nextEntries =
      nextCity === ALL_CITIES ? entries : entries.filter((entry) => entry.city === nextCity);
    setSelectedCity(nextCity);

    if (nextEntries.some((entry) => entry.startDate <= selectedDate && entry.endDate >= selectedDate)) return;

    const [year, monthNumber] = month.split('-').map(Number);
    const firstDay = `${month}-01`;
    const lastDay = toIsoDate(new Date(Date.UTC(year, monthNumber, 0)));
    const firstAvailableDay = nextEntries
      .filter((entry) => entry.endDate >= firstDay && entry.startDate <= lastDay)
      .map((entry) => [entry.startDate, firstDay, today].sort().at(-1)!)
      .filter((date) => date <= lastDay)
      .sort()[0];

    if (firstAvailableDay) setSelectedDate(firstAvailableDay);
    else setSelectedDate(month === initialMonth ? today : firstDay);
  }

  function changeMonth(delta: number) {
    const next = shiftMonth(month, delta);
    if (next < initialMonth || next > lastMonth) return;
    setMonth(next);
    const firstDay = `${next}-01`;
    const firstScheduledDay = filteredEntries
      .filter((entry) => entry.endDate >= firstDay && entry.endDate >= today && entry.startDate.slice(0, 7) <= next)
      .map((entry) => [entry.startDate, firstDay, today].sort().at(-1)!)
      .sort()[0];
    setSelectedDate(firstScheduledDay ?? (next === initialMonth ? today : firstDay));
  }

  function returnToCurrentMonth() {
    scrollDetailsOnDateChange.current = false;
    setMonth(initialMonth);
    setSelectedDate(today);
  }

  return (
    <div className="space-y-5">
      <section className="jp-panel rounded-2xl p-3 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            className="jp-calendar-nav"
            onClick={() => changeMonth(-1)}
            disabled={month <= initialMonth}
          >
            <span className="sr-only i18n-zh">上個月</span>
            <span className="sr-only i18n-ja">前月</span>
            <span aria-hidden>←</span>
          </button>
          <h2 className="text-lg font-bold tracking-tight text-fg sm:text-xl" aria-live="polite">
            {monthLabel(month)}
          </h2>
          <button
            type="button"
            className="jp-calendar-nav"
            onClick={() => changeMonth(1)}
            disabled={month >= lastMonth}
          >
            <span className="sr-only i18n-zh">下個月</span>
            <span className="sr-only i18n-ja">翌月</span>
            <span aria-hidden>→</span>
          </button>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            className="jp-calendar-current shrink-0 rounded-xl border border-hairline-strong bg-veil px-3 py-2 text-sm font-semibold text-fg-soft transition hover:bg-veil-strong hover:text-fg"
            onClick={returnToCurrentMonth}
          >
            <span className="i18n-zh">回到本月</span>
            <span className="i18n-ja">今月に戻る</span>
          </button>
          <div className="min-w-0 flex-1 sm:w-60 sm:flex-none">
            <FilterDropdown
              label="城市 / 都市"
              placeholder="所有城市 / すべての都市"
              options={cityOptions}
              selected={[selectedCity]}
              onChange={selectCity}
              selectionMode="single"
            />
          </div>
        </div>

        <div className="grid grid-cols-7">
          {WEEKDAYS.zh.map((day, index) => (
            <div key={index} className="jp-calendar-weekday">
              <span className="i18n-zh">{day}</span>
              <span className="i18n-ja">{WEEKDAYS.ja[index]}</span>
            </div>
          ))}
          {dates.map((date) => {
            const inMonth = date.slice(0, 7) === month;
            if (!inMonth) return <div key={date} className="jp-calendar-blank" aria-hidden="true" />;

            const dayEntries = entriesByDay.get(date) ?? [];
            const dayShows = groupByShow(dayEntries);
            const nowCount = dayShows.filter((show) =>
              show.entries.some((entry) => entry.status === 'now'),
            ).length;
            const upcomingCount = dayShows.filter((show) =>
              show.entries.some((entry) => entry.status === 'upcoming'),
            ).length;
            const selected = date === selectedDate;
            const isToday = date === today;
            const dayNumber = Number(date.slice(-2));
            const [dayYear, dayMonth] = date.split('-').map(Number);
            const weekday = new Date(Date.UTC(dayYear, dayMonth - 1, dayNumber)).getUTCDay();

            return (
              <div key={date}>
                <button
                  type="button"
                  className={`jp-calendar-day${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${dayEntries.length ? ' has-shows' : ''}`}
                  onClick={() => selectDate(date)}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={selected}
                >
                  <span className="jp-calendar-day__number" aria-hidden="true">{dayNumber}</span>
                  {isToday && (
                    <span className="jp-calendar-today-label">
                      <span className="i18n-zh">今天</span>
                      <span className="i18n-ja">今日</span>
                    </span>
                  )}
                  <span className="sr-only">
                    <span className="i18n-zh">
                      {dayYear}年{dayMonth}月{dayNumber}日，週{WEEKDAYS.zh[weekday]}，{nowCount} 部上演中劇目，{upcomingCount} 部即將開演劇目
                    </span>
                    <span className="i18n-ja">
                      {dayYear}年{dayMonth}月{dayNumber}日（{WEEKDAYS.ja[weekday]}曜日）、上演中 {nowCount} 作品、開幕予定 {upcomingCount} 作品
                    </span>
                  </span>
                  {dayEntries.length > 0 && (
                    <span className="jp-calendar-dots" aria-hidden>
                      {nowCount > 0 && <i className="is-now" />}
                      {upcomingCount > 0 && <i className="is-upcoming" />}
                      <span>{dayShows.length}</span>
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-hairline pt-3 text-xs text-fg-muted">
          <span className="inline-flex items-center gap-2">
            <i className="jp-calendar-legend-dot is-now" />
            <span className="i18n-zh">正在演出</span><span className="i18n-ja">上演中</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <i className="jp-calendar-legend-dot is-upcoming" />
            <span className="i18n-zh">即将演出</span><span className="i18n-ja">開幕予定</span>
          </span>
        </div>
      </section>

      <section
        ref={detailsRef}
        className="jp-panel jp-calendar-details rounded-2xl p-4 sm:p-5"
        aria-live="polite"
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-3">
          <h3 className="text-base font-semibold text-fg">
            <span className="i18n-zh">{selectedDate.replaceAll('-', '/')} 的公演</span>
            <span className="i18n-ja">{selectedDate.replaceAll('-', '/')}の公演</span>
          </h3>
          <span className="text-xs text-fg-muted">
            <span className="i18n-zh">{selectedShows.length} 部劇目</span>
            <span className="i18n-ja">{selectedShows.length} 作品</span>
          </span>
        </div>

        {selectedShows.length ? (
          <ul className="divide-y divide-hairline">
            {selectedShows.map((show) => (
              <li key={show.slug} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/show/${show.slug}`}
                  className="jp-calendar-event group block rounded-lg font-semibold text-fg hover:text-accent"
                >
                  <span className="i18n-zh">{show.title.zh}</span>
                  <span className="i18n-ja">{show.title.ja}</span>
                </Link>
                <ul className="mt-2 space-y-2 border-l border-hairline pl-3 sm:pl-4">
                  {show.entries.map((entry, index) => (
                    <li
                      key={`${entry.city}-${entry.venue.ja}-${entry.startDate}-${index}`}
                      className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                    >
                      <span className="min-w-0">
                        <span className="mr-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
                          <span
                            className={`jp-calendar-status${entry.status === 'now' ? ' is-now' : ' is-upcoming'}`}
                          >
                            {entry.status === 'now' ? (
                              <><span className="i18n-zh">正在演出</span><span className="i18n-ja">上演中</span></>
                            ) : (
                              <><span className="i18n-zh">即将演出</span><span className="i18n-ja">開幕予定</span></>
                            )}
                          </span>
                          <span className="text-xs text-fg-dim">{formatPeriod(entry.startDate, entry.endDate)}</span>
                        </span>
                        <span className="mt-1 block truncate text-xs text-fg-muted sm:inline sm:pl-1">
                          <span className="i18n-zh">
                            {entry.city ? `${cityLabel(entry.city, 'zh')} · ` : ''}
                            {entry.venue.zh}
                          </span>
                          <span className="i18n-ja">
                            {entry.city ? `${entry.city} · ` : ''}
                            {entry.venue.ja}
                          </span>
                        </span>
                      </span>
                      {entry.performances != null && (
                        <span className="shrink-0 text-xs text-fg-dim sm:text-right">
                          <span className="i18n-zh">共 {entry.performances} 場</span>
                          <span className="i18n-ja">全{entry.performances}公演</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-fg-muted">
            <span className="i18n-zh">這天沒有正在演出或即將演出的舞台劇。</span>
            <span className="i18n-ja">この日に上演中・開幕予定の公演はありません。</span>
          </p>
        )}
      </section>
    </div>
  );
}
