export type Direction = 'debit' | 'credit';

export type Source = 'notification' | 'email' | 'manual';

export interface RawMessage {
  /** Sender id / app package / email from-address, e.g. "HBL", "com.techlogix.mobilinkcustomer", "alerts@bank.com" */
  sender: string;
  body: string;
  receivedAt: Date;
  source: Source;
}

export interface ParsedTransaction {
  amount: number;
  currency: string;
  direction: Direction;
  merchant: string | null;
  /** Remaining balance reported in the alert, if any */
  balance: number | null;
  /** Last digits of account/card, if present */
  accountHint: string | null;
  /** True for movements between the user's own accounts / wallet top-ups — not real spending */
  isTransfer: boolean;
  /** Bank reference / transaction id, when the alert has one — exact key for duplicates */
  reference?: string | null;
  /** Last digits of the receiving account/wallet, when shown — detects transfers to own accounts */
  counterpartyHint?: string | null;
  /** The bank's own merchant category text, e.g. "Grocery Stores and Supermarkets" */
  bankCategory?: string | null;
  occurredAt: Date;
  sender: string;
  source: Source;
  /** Which parser produced it: a template id, or "heuristic" */
  parsedBy: string;
  /** 0..1 — low values should be queued for LLM fallback / user review */
  confidence: number;
}

export type ParseResult =
  | { kind: 'transaction'; tx: ParsedTransaction }
  | { kind: 'ignored'; reason: 'otp' | 'promo' | 'not-financial' | 'failed' };

/**
 * A parser for one bank/wallet alert format, built from real collected samples.
 * At least one of `sender` / `signature` is required, so a template never fires on unrelated text.
 *
 * Named groups in `pattern`:
 *  - amount (required)  - merchant (counterparty)  - balance  - account (last digits)
 *  - date   (parsed as Pakistan time; falls back to when the alert arrived)
 *  - dir    ("Debit"/"Credit" text; overrides `direction`)
 *  - self   (the user's own name; if it matches merchant, the movement is a transfer to self)
 *  - ref    (bank reference / transaction id)
 *  - to     (last 4 digits of the receiving account / wallet / RAAST id)
 */
export interface Template {
  id: string;
  /** Matches the sender id / app package / email address */
  sender?: RegExp;
  /** Matches the message body, for formats whose sender we can't pin down */
  signature?: RegExp;
  pattern: RegExp;
  /** Default direction when the pattern has no `dir` group */
  direction: Direction;
  isTransfer?: boolean;
}

export interface CategorizedTransaction extends ParsedTransaction {
  category: string;
  categorizedBy: 'user-rule' | 'dictionary' | 'bank' | 'keyword' | 'fallback';
}
