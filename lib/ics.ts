import { cityLabel } from '@/lib/i18n';
import type { CalendarEntry } from '@/lib/types';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://jpstage.example';

/**
 * RFC 5545 文本工具（「加入日曆」下载与 /calendar.ics 订阅共用）
 *
 * ★ 为什么收在这里：.ics 的转义与折叠规则很容易写错（逗号、分号、
 *   换行都要转义；单行限 75 字节还要按字符折叠、不能劈开多字节汉字），
 *   两处各写一份迟早不一致 —— 收进一个模块，规则只有一份。
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    ;
}

/** RFC 5545 限制单行 75 字节（UTF-8）；按字符折叠，不劈开多字节字符。 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  let folded = '';
  let byteLength = 0;
  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    if (byteLength + characterBytes > 75) {
      folded += '\r\n ';
      byteLength = 1;
    }
    folded += character;
    byteLength += characterBytes;
  }
  return folded;
}

/** DTEND 是排他端点：结束日要 +1 天才是 RFC 5545 语义。 */
function exclusiveEnd(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const monthPart = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dayPart = String(next.getUTCDate()).padStart(2, '0');
  return String(next.getUTCFullYear()) + monthPart + dayPart;
}

/**
 * 由档期列表构建完整 VCALENDAR 文本
 *
 * ★ 全站源（/calendar.ics）与按城市源（/calendar/<城市>）共用这一份：
 *   订阅文件的字段规则（UID、DTEND 排他端点、LOCATION 格式）只有一份，
 *   城市拆分只是「同一个构建器、不同的输入和日历名」。
 */
export function buildIcsCalendar(entries: CalendarEntry[], calname: string): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//jpstage//Show Calendar//ZH-JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeIcsText(calname),
    'X-WR-TIMEZONE:Asia/Tokyo',
  ];
  for (const entry of entries) {
    const showUrl = SITE + '/show/' + encodeURIComponent(entry.slug) + '/';
    const location = entry.city
      ? cityLabel(entry.city, 'ja') + '・' + entry.venue.ja
      : entry.venue.ja;
    const period =
      entry.startDate +
      '〜' +
      entry.endDate +
      (entry.performances == null ? '' : '（全' + entry.performances + '公演）');
    const description = [entry.title.zh, period, showUrl].join('\n');
    const uid =
      encodeURIComponent(entry.slug).replaceAll('%', '_') +
      '-' +
      entry.startDate.replaceAll('-', '') +
      '-' +
      entry.endDate.replaceAll('-', '') +
      '@jpstage.local';
    lines.push(
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + stamp,
      'DTSTART;VALUE=DATE:' + entry.startDate.replaceAll('-', ''),
      'DTEND;VALUE=DATE:' + exclusiveEnd(entry.endDate),
      'SUMMARY:' + escapeIcsText(entry.title.ja),
      'LOCATION:' + escapeIcsText(location),
      'DESCRIPTION:' + escapeIcsText(description),
      'URL:' + showUrl,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
