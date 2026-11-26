/**
 * Builds the Gmail search query so only bank/wallet alerts are ever downloaded.
 *
 * KNOWN_SENDERS is intentionally empty: real alert addresses must come from collected
 * samples (Phase 0, gate G4). Until then the keyword query does the filtering.
 */

/** Fill from real alert emails, e.g. "alerts@<bank-domain>". Never guess. */
export const KNOWN_SENDERS: string[] = [];

/** Gmail phrases that show up in transaction alerts. */
const ALERT_TERMS = ['debited', 'credited', '"transaction alert"', '"PKR"', '"Rs."', '"funds transfer"', '"payment received"'];

export interface QueryOptions {
  /** Look-back window for the first import */
  newerThanDays?: number;
  /** Incremental sync: only messages after this time (Gmail accepts epoch seconds) */
  afterEpochSeconds?: number;
  senders?: string[];
}

export function buildAlertQuery(opts: QueryOptions = {}): string {
  const senders = opts.senders ?? KNOWN_SENDERS;
  const parts: string[] = [];
  if (opts.afterEpochSeconds) parts.push(`after:${Math.floor(opts.afterEpochSeconds)}`);
  else if (opts.newerThanDays) parts.push(`newer_than:${opts.newerThanDays}d`);
  const keywordClause = `{${ALERT_TERMS.join(' ')}}`; // {a b} = OR in Gmail search
  if (senders.length) {
    parts.push(`{from:(${senders.join(' OR ')}) ${keywordClause}}`);
  } else {
    parts.push(keywordClause);
  }
  // Skip marketing tabs and chat logs; bank alerts land in Primary/Updates.
  parts.push('-category:promotions', '-category:social', '-in:chats');
  return parts.join(' ');
}
