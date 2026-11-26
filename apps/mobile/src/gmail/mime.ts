/**
 * Turn a Gmail API message payload into plain text.
 * Pure functions only (no React Native imports) so they run under `node --test`.
 *
 * Gmail returns part bodies already transfer-decoded, then base64url-encoded.
 * Hermes has no TextDecoder/Buffer guarantee, so both decoders are implemented here.
 */

export interface GmailHeader { name: string; value: string }
export interface GmailPart {
  mimeType?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
  filename?: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256).fill(255);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;
LOOKUP['-'.charCodeAt(0)] = 62; // base64url
LOOKUP['_'.charCodeAt(0)] = 63;

export function base64UrlToBytes(input: string): Uint8Array {
  const clean = input.replace(/[=\s]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0, bits = 0, o = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = LOOKUP[clean.charCodeAt(i)];
    if (v === 255) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

/** UTF-8 decode; invalid sequences become U+FFFD. Falls back to Latin-1 per byte only for stray bytes. */
export function utf8Decode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp: number, n: number;
    if (b < 0x80) { cp = b; n = 1; }
    else if (b >= 0xc2 && b < 0xe0) { cp = b & 0x1f; n = 2; }
    else if (b >= 0xe0 && b < 0xf0) { cp = b & 0x0f; n = 3; }
    else if (b >= 0xf0 && b < 0xf5) { cp = b & 0x07; n = 4; }
    else { s += '�'; i++; continue; }
    if (i + n > bytes.length) { s += '�'; break; }
    let ok = true;
    for (let k = 1; k < n; k++) {
      const c = bytes[i + k];
      if ((c & 0xc0) !== 0x80) { ok = false; break; }
      cp = (cp << 6) | (c & 0x3f);
    }
    if (!ok) { s += '�'; i++; continue; }
    s += String.fromCodePoint(cp);
    i += n;
  }
  return s;
}

export function decodeBody(data: string | undefined): string {
  return data ? utf8Decode(base64UrlToBytes(data)) : '';
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function walk(part: GmailPart, visit: (p: GmailPart) => void): void {
  visit(part);
  for (const child of part.parts ?? []) walk(child, visit);
}

/** Prefer text/plain; fall back to text/html converted to text. Attachments are skipped. */
export function extractText(payload: GmailPart): string {
  let plain = '';
  let html = '';
  walk(payload, p => {
    if (p.filename || p.body?.attachmentId) return;
    const mt = (p.mimeType ?? '').toLowerCase();
    if (mt === 'text/plain' && !plain) plain = decodeBody(p.body?.data);
    else if (mt === 'text/html' && !html) html = decodeBody(p.body?.data);
  });
  const text = plain.trim() || htmlToText(html);
  return text.replace(/\s+/g, ' ').trim();
}

export function header(payload: GmailPart, name: string): string | null {
  const h = payload.headers?.find(x => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

/** "HBL Alerts <alerts@bank.example>" → "alerts@bank.example" */
export function fromAddress(payload: GmailPart): string {
  const from = header(payload, 'From') ?? '';
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim().toLowerCase();
}
