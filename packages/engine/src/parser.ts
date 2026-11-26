import type { ParseResult, ParsedTransaction, RawMessage, Template, Direction } from './types.ts';

/**
 * Layer 1 — extraction.
 *
 * Order: OTP/promo filter → sender-specific templates (exact, high confidence)
 * → generic heuristic (medium/low confidence). Anything that fails or scores low
 * is meant to go to an LLM fallback, whose output is turned into a new template.
 *
 * NOTE: real per-bank templates must be built from collected alert samples
 * (Phase 0, gate G2). Do not guess bank formats.
 */

const AMOUNT = String.raw`(?:PKR|Rs\.?|RS\.?)\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)`;
const amountRe = new RegExp(AMOUNT, 'i');
// Global regex is only used via matchAll (which clones it), so shared lastIndex state is not an issue.
const amountReGlobal = new RegExp(AMOUNT, 'gi');

const OTP_RE = /\b(otp|one[-\s]?time\s+pass(word|code)?|verification code|do not share|tpin)\b/i;
const PROMO_RE = /\b(offer|discount|cashback offer|win|lucky draw|apply now|click here|sale)\b/i;

const DEBIT_RE = /\b(debited|spent|paid|purchase|withdrawn|withdrawal|sent|transferred to|deducted|charged|payment of)\b/i;
const CREDIT_RE = /\b(credited|received|deposited|refund(ed)?|salary|transferred from|cash ?in)\b/i;
const TRANSFER_RE = /\b(own account|self transfer|to your (wallet|account)|wallet top[-\s]?up|top[-\s]?up)\b/i;

const BALANCE_RE = new RegExp(String.raw`(?:avl\.?|available|avail\.?|current|new|remaining)?\s*bal(?:ance)?\.?\s*(?:is|:)?\s*` + AMOUNT, 'i');
const ACCOUNT_RE = /(?:a\/c|acct?|account|card)\s*(?:no\.?|#)?\s*(?:ending\s*(?:with|in)?\s*)?[x*]*\s*([0-9]{3,4})\b/i;
const MERCHANT_RE = /\b(?:at|to|from|@)\s+([A-Za-z0-9&'.\- ]{2,40}?)(?=\s+(?:on|via|for|ref|dated|from|using|with|at)\b|[.,;]|\s+\d|$)/i;

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''));
}

function cleanMerchant(m: string | undefined): string | null {
  if (!m) return null;
  const t = m.trim().replace(/\s{2,}/g, ' ');
  if (!t || /^(your|a\/c|account|card|you)\b/i.test(t)) return null;
  return t;
}

export function parseWithTemplate(msg: RawMessage, t: Template): ParsedTransaction | null {
  if (!t.sender.test(msg.sender)) return null;
  const m = t.pattern.exec(msg.body);
  if (!m?.groups?.amount) return null;
  const g = m.groups;
  return {
    amount: toNumber(g.amount),
    currency: 'PKR',
    direction: t.direction,
    merchant: cleanMerchant(g.merchant),
    balance: g.balance ? toNumber(g.balance) : null,
    accountHint: g.account ?? null,
    isTransfer: t.isTransfer ?? TRANSFER_RE.test(msg.body),
    occurredAt: msg.receivedAt,
    sender: msg.sender,
    source: msg.source,
    parsedBy: t.id,
    confidence: 0.98,
  };
}

export function parseHeuristic(msg: RawMessage): ParsedTransaction | null {
  const body = msg.body;
  const isDebit = DEBIT_RE.test(body);
  const isCredit = CREDIT_RE.test(body);
  if (!isDebit && !isCredit) return null;

  // The first amount that is not the balance amount is the transaction amount.
  const balMatch = BALANCE_RE.exec(body);
  const inBalance = (i: number) => balMatch != null && i >= balMatch.index && i < balMatch.index + balMatch[0].length;
  const first = [...body.matchAll(amountReGlobal)].find(a => !inBalance(a.index));
  if (!first) return null;

  let direction: Direction;
  let confidence = 0.75;
  if (isDebit && isCredit) {
    // e.g. "debited from your a/c and credited to X" — whichever verb comes first wins, but flag it.
    direction = body.search(DEBIT_RE) < body.search(CREDIT_RE) ? 'debit' : 'credit';
    confidence = 0.5;
  } else {
    direction = isDebit ? 'debit' : 'credit';
  }

  const merchant = cleanMerchant(MERCHANT_RE.exec(body)?.[1]);
  if (!merchant) confidence -= 0.15;

  return {
    amount: toNumber(first[1]),
    currency: 'PKR',
    direction,
    merchant,
    balance: balMatch ? toNumber(balMatch[1]) : null,
    accountHint: ACCOUNT_RE.exec(body)?.[1] ?? null,
    isTransfer: TRANSFER_RE.test(body),
    occurredAt: msg.receivedAt,
    sender: msg.sender,
    source: msg.source,
    parsedBy: 'heuristic',
    confidence,
  };
}

export function parseMessage(msg: RawMessage, templates: Template[] = []): ParseResult {
  if (OTP_RE.test(msg.body)) return { kind: 'ignored', reason: 'otp' };
  if (!amountRe.test(msg.body)) return { kind: 'ignored', reason: 'not-financial' };
  if (PROMO_RE.test(msg.body) && !/\b(debited|credited)\b/i.test(msg.body)) {
    return { kind: 'ignored', reason: 'promo' };
  }

  for (const t of templates) {
    const tx = parseWithTemplate(msg, t);
    if (tx) return { kind: 'transaction', tx };
  }

  const tx = parseHeuristic(msg);
  return tx ? { kind: 'transaction', tx } : { kind: 'ignored', reason: 'failed' };
}

/** Stable key so the same alert arriving via SMS notification AND email is counted once. */
export function dedupeKey(tx: ParsedTransaction, windowMinutes = 10): string {
  const bucket = Math.floor(tx.occurredAt.getTime() / (windowMinutes * 60_000));
  return `${tx.direction}|${tx.amount.toFixed(2)}|${tx.accountHint ?? ''}|${bucket}`;
}
