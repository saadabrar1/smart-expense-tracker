import {
  parseMessage, categorize, dedupeKey,
  type CategorizedTransaction, type Template, type UserRules,
} from '@smart-expense/engine';
import type { GmailClient, GmailMessage } from './api.ts';
import { buildAlertQuery } from './query.ts';
import { extractText, fromAddress, header } from './mime.ts';

/**
 * Gmail → transactions. First run imports the last N days; later runs fetch only
 * alerts newer than the previous sync. Everything happens on the device; the caller
 * decides what (parsed transactions only) to upload.
 */

export interface SyncState {
  /** Start time of the last successful sync (ms). null = never synced → backfill. */
  lastSyncMs: number | null;
  /** Gmail ids already processed (bounded), so overlapping windows never double count */
  seenIds: string[];
}

export const EMPTY_STATE: SyncState = { lastSyncMs: null, seenIds: [] };

export interface SyncOptions {
  gmail: GmailClient;
  state: SyncState;
  now?: () => Date;
  backfillDays?: number;
  /** Safety cap on messages fetched per run (quota + battery) */
  maxMessages?: number;
  concurrency?: number;
  templates?: Template[];
  userRules?: UserRules;
  senders?: string[];
}

export interface UnparsedAlert {
  gmailId: string;
  from: string;
  subject: string | null;
  reason: string;
}

export interface SyncResult {
  transactions: CategorizedTransaction[];
  /** Looked like alerts but couldn't be parsed — candidates for "help us support this bank" (opt-in) */
  unparsed: UnparsedAlert[];
  scanned: number;
  /** True if maxMessages was hit; call sync again to continue */
  truncated: boolean;
  nextState: SyncState;
}

const OVERLAP_MS = 15 * 60_000;
const MAX_SEEN = 5000;

async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

export function messageToRaw(m: GmailMessage) {
  const subject = header(m.payload, 'Subject');
  const text = extractText(m.payload);
  return {
    sender: fromAddress(m.payload),
    subject,
    // Subject often carries the amount ("Rs. 4,500 debited…"), so parse it together with the body.
    body: subject ? `${subject}. ${text}` : text,
    receivedAt: new Date(Number(m.internalDate)),
    source: 'email' as const,
  };
}

export async function syncGmail(opts: SyncOptions): Promise<SyncResult> {
  const now = (opts.now ?? (() => new Date()))();
  const maxMessages = opts.maxMessages ?? 500;
  const seen = new Set(opts.state.seenIds);

  const q = opts.state.lastSyncMs == null
    ? buildAlertQuery({ newerThanDays: opts.backfillDays ?? 90, senders: opts.senders })
    : buildAlertQuery({ afterEpochSeconds: (opts.state.lastSyncMs - OVERLAP_MS) / 1000, senders: opts.senders });

  // 1. Collect ids (newest first, as Gmail returns them), skipping ones already processed.
  const ids: string[] = [];
  let pageToken: string | undefined;
  let truncated = false;
  do {
    const page = await opts.gmail.listMessageIds(q, pageToken);
    for (const id of page.ids) {
      if (seen.has(id)) continue;
      if (ids.length >= maxMessages) { truncated = true; break; }
      ids.push(id);
    }
    pageToken = truncated ? undefined : page.nextPageToken;
  } while (pageToken);

  // 2. Fetch + parse on device.
  const messages = await pool(ids, opts.concurrency ?? 5, id => opts.gmail.getMessage(id));
  const transactions: CategorizedTransaction[] = [];
  const unparsed: UnparsedAlert[] = [];
  const keys = new Set<string>();

  for (const m of messages) {
    seen.add(m.id);
    const raw = messageToRaw(m);
    const r = parseMessage(raw, opts.templates ?? []);
    if (r.kind === 'transaction') {
      const key = dedupeKey(r.tx);
      if (keys.has(key)) continue; // same alert sent twice (e.g. bank resend)
      keys.add(key);
      transactions.push(categorize(r.tx, opts.userRules));
    } else if (r.reason === 'failed') {
      unparsed.push({ gmailId: m.id, from: raw.sender, subject: raw.subject, reason: r.reason });
    }
  }

  transactions.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  // When truncated, keep the old watermark so the next run continues the same window
  // (seenIds stops re-processing). Otherwise advance it to this run's *start* time.
  const nextState: SyncState = {
    lastSyncMs: truncated ? opts.state.lastSyncMs : now.getTime(),
    seenIds: [...seen].slice(-MAX_SEEN),
  };

  return { transactions, unparsed, scanned: messages.length, truncated, nextState };
}
