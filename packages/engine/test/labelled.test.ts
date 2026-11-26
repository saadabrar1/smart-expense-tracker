import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage, readLabelledFields, categorize, categoryFromBank, type ParsedTransaction, type RawMessage } from '../src/index.ts';

/*
 * Layout copied from a real wallet e-mail (orange "Retail Transaction" receipt, Raast channel),
 * as the HTML table reads once flattened to text. The transaction id is replaced.
 */
const RETAIL_RECEIPT = `SAVOUR FOODS
Retail Transaction
18 Sep 2026, 08:58 PM
- Rs. 720
AMOUNT DETAILS
Transaction Amount Rs. 720
Service Fee (Incl. Tax) Rs. 0
Total Amount Rs. 720
TRANSACTION DETAILS
Transaction ID 0f0f0f0f0f0f0f0f0f0f0f0f
ADDITIONAL INFORMATION
Type of Transaction Retail
Merchant Category Grocery Stores and Supermarkets
Merchant Details SAVOUR FOODS
Channel Raast
View your transactions`;

// Same layout, a merchant our dictionary doesn't know → the bank's category decides.
const UNKNOWN_SHOP = RETAIL_RECEIPT.replaceAll('SAVOUR FOODS', 'AL-NOOR KARYANA CENTER').replaceAll('720', '1,345.50');

const msg = (body: string, sender = 'notifications@wallet.example'): RawMessage =>
  ({ sender, body, receivedAt: new Date('2026-09-18T20:00:00Z'), source: 'email' });

function tx(m: RawMessage): ParsedTransaction {
  const r = parseMessage(m);
  assert.equal(r.kind, 'transaction', JSON.stringify(r));
  return (r as { tx: ParsedTransaction }).tx;
}

test('readLabelledFields: values end at the next label or section heading', () => {
  const f = readLabelledFields(RETAIL_RECEIPT.replace(/\s+/g, ' '));
  assert.equal(f.total, 'Rs. 720');
  assert.equal(f.amount, 'Rs. 720');
  assert.equal(f.fee, 'Rs. 0');
  assert.equal(f.ref, '0f0f0f0f0f0f0f0f0f0f0f0f');
  assert.equal(f.type, 'Retail');
  assert.equal(f.bankCategory, 'Grocery Stores and Supermarkets');
  assert.equal(f.merchant, 'SAVOUR FOODS');
  assert.equal(f.channel, 'Raast');
});

for (const [label, shape] of [['multi-line', (s: string) => s], ['flattened HTML', (s: string) => s.replace(/\s+/g, ' ')]] as const) {
  test(`unknown wallet layout parsed without a template (${label})`, () => {
    const t = tx(msg(shape(RETAIL_RECEIPT)));
    assert.equal(t.parsedBy, 'labelled');
    assert.equal(t.amount, 720);
    assert.equal(t.direction, 'debit');
    assert.equal(t.merchant, 'SAVOUR FOODS');
    assert.equal(t.reference, '0f0f0f0f0f0f0f0f0f0f0f0f');
    assert.equal(t.bankCategory, 'Grocery Stores and Supermarkets');
    assert.equal(t.occurredAt.toISOString(), '2026-09-18T15:58:00.000Z', 'date read from the receipt (PKT)');
  });
}

test('category: known merchant dictionary first, then the bank category for unknown merchants', () => {
  assert.equal(categorize(tx(msg(RETAIL_RECEIPT))).category, 'Food & Dining', 'Savour Foods is a restaurant, whatever the MCC says');
  const unknown = categorize(tx(msg(UNKNOWN_SHOP)));
  assert.equal(unknown.amount, 1345.5);
  assert.equal(unknown.category, 'Groceries');
  assert.equal(unknown.categorizedBy, 'bank');
});

test('categoryFromBank maps common MCC descriptions', () => {
  assert.equal(categoryFromBank('Eating Places, Restaurants'), 'Food & Dining');
  assert.equal(categoryFromBank('Automated Fuel Dispensers'), 'Fuel');
  assert.equal(categoryFromBank('Drug Stores and Pharmacies'), 'Health');
  assert.equal(categoryFromBank('Something Unheard Of'), null);
});

test('free-text SMS is not mistaken for a labelled table', () => {
  const r = parseMessage(msg('PKR 4,500.00 spent at KHAADI on card ending 1234. Avl Bal PKR 52,300.50', 'BANK'));
  assert.equal(r.kind === 'transaction' && r.tx.parsedBy, 'heuristic');
});
