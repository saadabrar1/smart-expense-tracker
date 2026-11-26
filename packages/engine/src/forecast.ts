import type { CategorizedTransaction } from './types.ts';

/**
 * Layer 3 — insight & warnings. Plain statistics, no ML needed for the MVP.
 */

const DAY = 86_400_000;

export interface SpendingInsight {
  /** Average daily spend (excl. transfers) over the last 7 / 30 days */
  avgDaily7: number;
  avgDaily30: number;
  spentToday: number;
  /** Per-category spend over the last 30 days, descending */
  byCategory: { category: string; amount: number; share: number }[];
  /** Days until balance hits zero at the 30-day pace; null if unknown balance or no spend */
  runwayDays: number | null;
  /** Projected date the balance runs out */
  runsOutOn: Date | null;
  /** How much can be spent per day to make the balance last until nextIncomeOn */
  safeToSpendPerDay: number | null;
  warnings: Warning[];
}

export type Warning =
  | { type: 'runs-out-before-payday'; runsOutOn: Date; nextIncomeOn: Date }
  | { type: 'low-runway'; days: number }
  | { type: 'pace-up'; avgDaily7: number; avgDaily30: number; pctAbove: number }
  | { type: 'over-today'; spentToday: number; avgDaily30: number }
  | { type: 'category-spike'; category: string; last7: number; typicalWeek: number };

export interface InsightOptions {
  now: Date;
  /** Latest known balance (from the most recent alert or set by the user) */
  balance?: number | null;
  /** Next expected salary/income date, if known */
  nextIncomeOn?: Date | null;
  lowRunwayDays?: number;
}

function isSpend(t: CategorizedTransaction): boolean {
  return t.direction === 'debit' && !t.isTransfer;
}

function sum(txs: CategorizedTransaction[]): number {
  return txs.reduce((s, t) => s + t.amount, 0);
}

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function computeInsight(all: CategorizedTransaction[], opts: InsightOptions): SpendingInsight {
  const now = opts.now.getTime();
  const spend = all.filter(isSpend);
  const within = (days: number) => spend.filter(t => t.occurredAt.getTime() > now - days * DAY && t.occurredAt.getTime() <= now);

  const last7 = within(7);
  const last30 = within(30);
  // Divide by days actually covered, so a 10-day-old account isn't averaged over 30.
  const firstSeen = spend.length ? Math.min(...spend.map(t => t.occurredAt.getTime())) : now;
  const coveredDays = (n: number) => Math.max(1, Math.min(n, Math.ceil((now - firstSeen) / DAY)));
  const avgDaily7 = sum(last7) / coveredDays(7);
  const avgDaily30 = sum(last30) / coveredDays(30);
  const spentToday = sum(spend.filter(t => t.occurredAt.getTime() >= startOfDay(opts.now) && t.occurredAt.getTime() <= now));

  const total30 = sum(last30);
  const catMap = new Map<string, number>();
  for (const t of last30) catMap.set(t.category, (catMap.get(t.category) ?? 0) + t.amount);
  const byCategory = [...catMap.entries()]
    .map(([category, amount]) => ({ category, amount, share: total30 ? amount / total30 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const balance = opts.balance ?? latestBalance(all);
  const pace = Math.max(avgDaily7, avgDaily30); // be conservative
  const runwayDays = balance != null && pace > 0 ? Math.floor(balance / pace) : null;
  const runsOutOn = runwayDays != null ? new Date(startOfDay(opts.now) + runwayDays * DAY) : null;

  let safeToSpendPerDay: number | null = null;
  if (balance != null && opts.nextIncomeOn) {
    const daysLeft = Math.max(1, Math.ceil((opts.nextIncomeOn.getTime() - now) / DAY));
    safeToSpendPerDay = Math.max(0, balance / daysLeft);
  }

  const warnings: Warning[] = [];
  if (runsOutOn && opts.nextIncomeOn && runsOutOn < opts.nextIncomeOn) {
    warnings.push({ type: 'runs-out-before-payday', runsOutOn, nextIncomeOn: opts.nextIncomeOn });
  } else if (runwayDays != null && runwayDays <= (opts.lowRunwayDays ?? 7)) {
    warnings.push({ type: 'low-runway', days: runwayDays });
  }
  if (avgDaily30 > 0 && avgDaily7 > avgDaily30 * 1.25) {
    warnings.push({ type: 'pace-up', avgDaily7, avgDaily30, pctAbove: Math.round((avgDaily7 / avgDaily30 - 1) * 100) });
  }
  if (avgDaily30 > 0 && spentToday > avgDaily30 * 2) {
    warnings.push({ type: 'over-today', spentToday, avgDaily30 });
  }
  // Category spike: last 7 days vs the previous 23 days' weekly rate.
  for (const { category } of byCategory) {
    const c7 = sum(last7.filter(t => t.category === category));
    const prior = sum(last30.filter(t => t.category === category && t.occurredAt.getTime() <= now - 7 * DAY));
    const typicalWeek = (prior / 23) * 7;
    if (typicalWeek > 0 && c7 > typicalWeek * 2 && c7 - typicalWeek > 1000) {
      warnings.push({ type: 'category-spike', category, last7: c7, typicalWeek: Math.round(typicalWeek) });
    }
  }

  return { avgDaily7, avgDaily30, spentToday, byCategory, runwayDays, runsOutOn, safeToSpendPerDay, warnings };
}

function latestBalance(all: CategorizedTransaction[]): number | null {
  const withBal = all.filter(t => t.balance != null).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return withBal[0]?.balance ?? null;
}

const pkr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-PK')}`;

/** Human-readable message for a push notification / dashboard banner. */
export function describeWarning(w: Warning): string {
  switch (w.type) {
    case 'runs-out-before-payday':
      return `At your current pace your balance runs out on ${w.runsOutOn.toDateString()}, before your next income on ${w.nextIncomeOn.toDateString()}.`;
    case 'low-runway':
      return `Only about ${w.days} day(s) of spending left at your current pace.`;
    case 'pace-up':
      return `You're spending ${pkr(w.avgDaily7)}/day this week, ${w.pctAbove}% above your usual ${pkr(w.avgDaily30)}/day.`;
    case 'over-today':
      return `You've spent ${pkr(w.spentToday)} today, more than double your daily average of ${pkr(w.avgDaily30)}.`;
    case 'category-spike':
      return `${w.category}: ${pkr(w.last7)} in the last 7 days vs a typical ${pkr(w.typicalWeek)} per week.`;
  }
}
