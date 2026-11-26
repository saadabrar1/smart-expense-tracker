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

export interface Template {
  id: string;
  /** Matches the sender id (case-insensitive) */
  sender: RegExp;
  pattern: RegExp;
  direction: Direction;
  /** Named groups expected in pattern: amount (required), merchant, balance, account */
  isTransfer?: boolean;
}

export interface CategorizedTransaction extends ParsedTransaction {
  category: string;
  categorizedBy: 'user-rule' | 'dictionary' | 'keyword' | 'fallback';
}
