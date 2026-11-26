import type { Template } from './types.ts';

/**
 * Templates built from REAL alert samples (anonymised copies live in test/templates.test.ts).
 * Every pattern tolerates any whitespace between fields, because the same alert arrives
 * as multi-line text (notification / plain-text email) or collapsed to one line (HTML email).
 */

const AMT = String.raw`(?<amount>[0-9][0-9,]*(?:\.[0-9]{1,2})?)`;

/**
 * Easypaisa (Telenor Microfinance Bank) e-mails with a "TRANSACTION DETAILS" block.
 * Seen: "Money Transfer to Easypaisa", "Mobile Package". Receiver Name is present only for
 * transfers to a person; otherwise the transaction type names the transaction.
 * Total (amount + fee) is what left the wallet.
 */
const easypaisaEmail: Template = {
  id: 'pk.easypaisa.email.transaction-details',
  sender: /e\.statement@telenorbank\.pk/i,
  direction: 'debit',
  pattern: new RegExp(
    String.raw`Transaction\s+Type\s+(?<type>.+?)\s+Transaction\s+ID\s+(?<ref>\d+)\s+` +
    String.raw`Date\s*&\s*Time\s+(?<date>\d{1,2}-[A-Za-z]{3}-\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?)\s+` +
    String.raw`Sender\s+Name\s+(?<self>.+?)\s+Sender\s+Number\s+\d*(?<account>\d{4})\b` +
    // Receiver Name + Number = a transfer to that wallet; Number alone = the phone a package/load was for
    // (not an account of the user's, so `to` is only captured in the first case).
    String.raw`(?:\s+Receiver\s+Name\s+(?<merchant>.+?)\s+Receiver\s+Number\s+\d*(?<to>\d{4})\b|\s+Receiver\s+Number\s+\d+\b)[\s\S]*?` +
    String.raw`Total\s+Rs\.?\s?` + AMT,
    'i',
  ),
};

/** Bank Alfalah short e-mail/SMS: "Dear X PKR 500.00 sent to Y -RAAST ID **03**-***1234 on 25-Nov-2026 09:17 Ref FT… via RAAST". */
const alfalahSent: Template = {
  id: 'pk.alfalah.sent',
  sender: /alfalah/i,
  direction: 'debit',
  pattern: new RegExp(
    String.raw`Dear\s+(?<self>.+?)\s+PKR\s?` + AMT + String.raw`\s+sent\s+to\s+(?<merchant>.+?)\s*-\s*` +
    String.raw`(?:RAAST\s+ID|A\/C|IBAN|Account)\s+[*\dA-Z-]*?(?<to>\d{4})\s+on\s+` +
    String.raw`(?<date>\d{1,2}-[A-Za-z]{3}-\d{4}\s+\d{1,2}:\d{2})\s+Ref\s+(?<ref>[A-Z0-9]+)`,
    'i',
  ),
};

/**
 * Bank Alfalah detailed e-mail ("Transaction Successful … Transaction Type Debit … Amount PKR 8,500.00/-").
 * Sent alongside the short one for the same payment (same Ref) — merged as one transaction.
 */
const alfalahDetailed: Template = {
  id: 'pk.alfalah.email.transaction',
  sender: /alfalah/i,
  signature: /111[\s-]?225[\s-]?111/,
  direction: 'debit',
  pattern: new RegExp(
    String.raw`(?<date>[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}\s*\|\s*\d{1,2}:\d{2}\s*[AP]M)[\s\S]*?` +
    String.raw`Ref#?\s*(?<ref>[A-Z0-9]+)[\s\S]*?` +
    String.raw`Account\s*\/\s*IBAN\s+[*xX]*(?<account>\d{4})\b[\s\S]*?` +
    String.raw`Transaction\s+Type\s+(?<dir>Debit|Credit)\b[\s\S]*?` +
    String.raw`\bAmount\s+PKR\s?` + AMT,
    'i',
  ),
};

export const BUILT_IN_TEMPLATES: Template[] = [easypaisaEmail, alfalahSent, alfalahDetailed];
