/**
 * Dates printed inside Pakistani bank/wallet alerts are local time (PKT, UTC+5, no DST).
 * Parse them to an absolute instant so the phone, the server and tests agree.
 */

const PKT_OFFSET_HOURS = 5;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthIndex(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase());
}

function pkt(y: number, m: number, d: number, h: number, min: number, s: number): Date | null {
  if (m < 0 || d < 1 || d > 31 || h > 23 || min > 59 || s > 59) return null;
  return new Date(Date.UTC(y, m, d, h - PKT_OFFSET_HOURS, min, s));
}

/**
 * Supported:
 *  - "26-Nov-2026 14:11:05" / "26-Nov-2026 14:11"   (Easypaisa)
 *  - "November 25, 2026 | 2:14 PM" (optionally after a weekday) (Bank Alfalah)
 *  - "18 Sep 2026, 08:58 PM"                       (NayaPay-style)
 *  - "26/11/2026 14:11" (day first)
 */
export function parsePkDate(text: string): Date | null {
  let m = /(\d{1,2})-([A-Za-z]{3,9})-(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (m) return pkt(+m[3], monthIndex(m[2]), +m[1], +m[4], +m[5], +(m[6] ?? 0));

  m = /([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})\s*\|?\s*(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(text);
  if (m) {
    let h = +m[4] % 12;
    if (m[6].toUpperCase() === 'PM') h += 12;
    return pkt(+m[3], monthIndex(m[1]), +m[2], h, +m[5], 0);
  }

  // "18 Sep 2026, 08:58 PM" (NayaPay-style) — also without AM/PM as 24-hour
  m = /(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?/i.exec(text);
  if (m && monthIndex(m[2]) >= 0) {
    let h = +m[4];
    if (m[7]) h = (h % 12) + (m[7].toUpperCase() === 'PM' ? 12 : 0);
    return pkt(+m[3], monthIndex(m[2]), +m[1], h, +m[5], +(m[6] ?? 0));
  }

  m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (m) return pkt(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] ?? 0));

  return null;
}
