import type { StoredTransaction } from './transactions.ts';

import type { Warning } from '@smart-expense/engine';

/** Pure helpers behind the Today and Insights screens (tested under node). */

/** Which Settings switch controls each warning type. */
export function warningEnabled(w: Warning, on: { runout: boolean; pace: boolean; jump: boolean }): boolean {
  switch (w.type) {
    case 'runs-out-before-payday':
    case 'low-runway':
      return on.runout;
    case 'pace-up':
    case 'over-today':
      return on.pace;
    case 'category-spike':
      return on.jump;
  }
}

const DAY = 86_400_000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Spending (debits, transfers excluded) per calendar day for the last `days` days, oldest first. */
export function dailySpend(txs: Pick<StoredTransaction, 'amount' | 'direction' | 'isTransfer' | 'occurredAt'>[], now: Date, days: number) {
  const today = startOfDay(now).getTime();
  const out = Array.from({ length: days }, (_, i) => ({ date: new Date(today - (days - 1 - i) * DAY), total: 0 }));
  for (const t of txs) {
    if (t.direction !== 'debit' || t.isTransfer) continue;
    const day = startOfDay(new Date(t.occurredAt)).getTime();
    const i = Math.round((day - out[0].date.getTime()) / DAY);
    if (i >= 0 && i < days) out[i].total += t.amount;
  }
  return out;
}

/** Next occurrence of the given day of month (clamped to short months), strictly after today. */
export function nextPayday(paydayDay: number | null, now: Date): Date | null {
  if (!paydayDay) return null;
  const make = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(paydayDay, last));
  };
  const today = startOfDay(now);
  let d = make(today.getFullYear(), today.getMonth());
  if (d <= today) d = make(today.getFullYear(), today.getMonth() + 1);
  return d;
}

/** "Today", "Yesterday", or "Tue 24 Nov" — section titles in Activity. */
export function dayLabel(d: Date, now: Date): string {
  const diff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function timeLabel(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
