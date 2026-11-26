import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base64UrlToBytes, utf8Decode, decodeBody, htmlToText, extractText, fromAddress, type GmailPart } from '../src/gmail/mime.ts';
import { buildAlertQuery } from '../src/gmail/query.ts';
import { syncGmail, EMPTY_STATE } from '../src/gmail/sync.ts';
import { createGmailClient, GmailError, type GmailClient, type GmailMessage } from '../src/gmail/api.ts';
import { mergeTransactions, fromStored } from '../src/transactions.ts';

// Node's Buffer is used ONLY to produce fixtures; the code under test never uses it.
const b64url = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

test('base64url + UTF-8 decoding matches Node, incl. Urdu and emoji', () => {
  for (const s of ['', 'a', 'ab', 'abc', 'PKR 4,500 debited', 'خرچہ Rs ۵۰۰ 💸', 'é€']) {
    assert.equal(decodeBody(b64url(s)), s);
  }
  assert.deepEqual([...base64UrlToBytes('-_8')], [...Buffer.from('-_8', 'base64url')]);
  assert.equal(utf8Decode(new Uint8Array([0x61, 0xff, 0x62])), 'a�b');
});

test('htmlToText strips tags, styles and entities', () => {
  const html = '<html><head><style>p{color:red}</style></head><body><p>Dear&nbsp;Customer,</p><table><tr><td>Amount</td><td>PKR 4,500</td></tr></table><p>A&amp;B &#8377; &#x41;</p></body></html>';
  assert.equal(htmlToText(html), 'Dear Customer,\nAmount PKR 4,500\nA&B ₹ A');
});

test('extractText prefers text/plain, falls back to HTML, skips attachments', () => {
  const payload: GmailPart = {
    mimeType: 'multipart/mixed',
    parts: [
      { mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/html', body: { data: b64url('<b>HTML version</b>') } },
        { mimeType: 'text/plain', body: { data: b64url('Plain  version\n here') } },
      ] },
      { mimeType: 'text/plain', filename: 'statement.txt', body: { attachmentId: 'x' } },
    ],
  };
  assert.equal(extractText(payload), 'Plain version here');
  assert.equal(extractText({ mimeType: 'text/html', body: { data: b64url('<p>Only&nbsp;HTML</p>') } }), 'Only HTML');
});

test('fromAddress extracts and lowercases the email', () => {
  assert.equal(fromAddress({ headers: [{ name: 'From', value: 'Bank Alerts <Alerts@Bank.Example>' }] }), 'alerts@bank.example');
  assert.equal(fromAddress({ headers: [{ name: 'from', value: 'noreply@wallet.example' }] }), 'noreply@wallet.example');
});

test('query: keyword filter by default, sender filter when known, incremental "after:"', () => {
  const q1 = buildAlertQuery({ newerThanDays: 90 });
  assert.match(q1, /^newer_than:90d \{debited credited /);
  assert.match(q1, /-category:promotions/);
  const q2 = buildAlertQuery({ afterEpochSeconds: 1764150000.7, senders: ['a@x.example', 'b@y.example'] });
  assert.match(q2, /^after:1764150000 \{from:\(a@x\.example OR b@y\.example\) \{/);
  assert.doesNotMatch(q2, /newer_than/);
});

// ---- sync with a fake Gmail ----
function fakeGmail(messages: GmailMessage[], pageSize = 2) {
  const calls = { list: [] as string[], get: [] as string[] };
  const client: GmailClient = {
    async listMessageIds(q, pageToken) {
      calls.list.push(q);
      const start = pageToken ? Number(pageToken) : 0;
      const ids = messages.slice(start, start + pageSize).map(m => m.id);
      const next = start + pageSize < messages.length ? String(start + pageSize) : undefined;
      return { ids, nextPageToken: next };
    },
    async getMessage(id) {
      calls.get.push(id);
      return messages.find(m => m.id === id)!;
    },
  };
  return { client, calls };
}

const mail = (id: string, from: string, subject: string, body: string, at: string): GmailMessage => ({
  id, threadId: id, internalDate: String(new Date(at).getTime()),
  payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: from }, { name: 'Subject', value: subject }], body: { data: b64url(body) } },
});

const inbox = [
  mail('m1', 'Alerts <alerts@bank.example>', 'Transaction Alert', 'PKR 4,500.00 spent at KHAADI on card ending 1234. Avl Bal PKR 52,300.', '2026-11-25T12:00:00Z'),
  mail('m2', 'alerts@bank.example', 'Credit Alert', 'Your A/C xx1234 has been credited with Rs 150,000 salary from ACME.', '2026-11-24T05:00:00Z'),
  mail('m3', 'alerts@bank.example', 'Your OTP', 'Your OTP for Rs. 2,000 is 482913. Do not share.', '2026-11-24T04:00:00Z'),
  mail('m4', 'alerts@bank.example', 'Statement', 'Rs. 99 something unusual happened xx.', '2026-11-23T04:00:00Z'),
  // bank re-sends the same alert
  mail('m5', 'alerts@bank.example', 'Transaction Alert', 'PKR 4,500.00 spent at KHAADI on card ending 1234.', '2026-11-25T12:03:00Z'),
];

test('first sync: backfill, parse, categorise, skip OTP, report unparsed, dedupe resends', async () => {
  const { client, calls } = fakeGmail(inbox);
  const now = new Date('2026-11-26T10:00:00Z');
  const r = await syncGmail({ gmail: client, state: EMPTY_STATE, now: () => now });

  assert.match(calls.list[0], /^newer_than:90d/);
  assert.equal(r.scanned, 5);
  assert.equal(r.transactions.length, 2);
  const [debit, credit] = r.transactions;
  assert.equal(debit.amount, 4500);
  assert.equal(debit.category, 'Clothing');
  assert.equal(debit.source, 'email');
  assert.equal(credit.category, 'Income');
  assert.deepEqual(r.unparsed.map(u => u.id), ['m4']);
  assert.match(r.unparsed[0].text, /Rs. 99 something unusual/, 'text kept on device for the review screen');
  assert.equal(r.unparsed[0].receivedAt, Date.parse('2026-11-23T04:00:00Z'));
  assert.equal(r.nextState.lastSyncMs, now.getTime());
  assert.equal(r.nextState.seenIds.length, 5);
});

test('incremental sync uses after:, never refetches seen ids', async () => {
  const { client } = fakeGmail(inbox);
  const first = await syncGmail({ gmail: client, state: EMPTY_STATE, now: () => new Date('2026-11-26T10:00:00Z') });

  const newMail = mail('m6', 'alerts@bank.example', 'Alert', 'Rs. 1,200 paid to FOODPANDA from A/C xx1234.', '2026-11-26T11:00:00Z');
  const second = fakeGmail([newMail, ...inbox]);
  const r = await syncGmail({ gmail: second.client, state: first.nextState, now: () => new Date('2026-11-26T12:00:00Z') });

  assert.match(second.calls.list[0], /^after:\d+ /);
  assert.deepEqual(second.calls.get, ['m6']);
  assert.equal(r.transactions[0].category, 'Food & Dining');
});

test('maxMessages truncates and keeps the watermark so the next pass continues', async () => {
  const { client } = fakeGmail(inbox);
  const r1 = await syncGmail({ gmail: client, state: EMPTY_STATE, maxMessages: 2 });
  assert.equal(r1.truncated, true);
  assert.equal(r1.nextState.lastSyncMs, null);
  const r2 = await syncGmail({ gmail: client, state: r1.nextState, maxMessages: 10 });
  assert.equal(r2.truncated, false);
  assert.equal(r1.scanned + r2.scanned, 5);
});

test('merge: same transaction from notification + email is stored once', async () => {
  const { client } = fakeGmail(inbox);
  const r = await syncGmail({ gmail: client, state: EMPTY_STATE });
  const stored = mergeTransactions([], r.transactions);
  const again = mergeTransactions(stored, r.transactions.map(t => ({ ...t, source: 'notification' as const })));
  assert.equal(again.length, stored.length);
  assert.ok(fromStored(again[0]).occurredAt instanceof Date);
});

// ---- REST client ----
test('client: sends bearer token, retries once on 401 with a fresh token, backs off on 429', async () => {
  const seen: string[] = [];
  let token = 't1';
  const responses = [401, 429, 200];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    seen.push(`${(init!.headers as Record<string, string>).Authorization} ${url}`);
    const status = responses.shift()!;
    return new Response(status === 200 ? JSON.stringify({ messages: [{ id: 'a' }] }) : '{}', { status });
  }) as typeof fetch;
  const client = createGmailClient(async () => token, async () => { token = 't2'; }, fetchFn);

  const r = await client.listMessageIds('debited');
  assert.deepEqual(r.ids, ['a']);
  assert.match(seen[0], /^Bearer t1 https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\?q=debited&maxResults=100$/);
  assert.match(seen[1], /^Bearer t2 /);

  const failing = createGmailClient(async () => 'x', undefined, (async () => new Response('{}', { status: 403 })) as typeof fetch);
  await assert.rejects(failing.getMessage('z'), (e: unknown) => e instanceof GmailError && e.status === 403);
});
