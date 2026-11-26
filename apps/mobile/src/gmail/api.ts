import type { GmailPart } from './mime.ts';

/**
 * Minimal Gmail REST client. Runs on the phone with the user's access token;
 * email content never goes to our server (keeps us in the on-device model).
 *
 * Only messages.list (with a search filter) and messages.get are used, so Google filters
 * server-side and the phone never downloads non-alert email. (history.list is avoided on
 * purpose: it returns every new message, personal mail included.)
 */

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface GmailMessage {
  id: string;
  threadId: string;
  /** ms since epoch, as a string */
  internalDate: string;
  snippet?: string;
  payload: GmailPart;
}

export class GmailError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface GmailClient {
  listMessageIds(q: string, pageToken?: string): Promise<{ ids: string[]; nextPageToken?: string }>;
  getMessage(id: string): Promise<GmailMessage>;
}

type TokenProvider = () => Promise<string>;

export function createGmailClient(
  getToken: TokenProvider,
  onUnauthorized?: (staleToken: string) => Promise<void>,
  fetchFn: typeof fetch = fetch,
): GmailClient {
  async function call<T>(path: string, params: Record<string, string | undefined>, attempt = 0): Promise<T> {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
      .join('&');
    const token = await getToken();
    const res = await fetchFn(`${BASE}${path}${qs ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.status === 401 && attempt === 0 && onUnauthorized) {
      await onUnauthorized(token); // clear the cached token, then retry once with a fresh one
      return call<T>(path, params, 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
      return call<T>(path, params, attempt + 1);
    }
    if (!res.ok) throw new GmailError(res.status, `Gmail ${path} → HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  return {
    async listMessageIds(q, pageToken) {
      const r = await call<{ messages?: { id: string }[]; nextPageToken?: string }>('/messages', { q, pageToken, maxResults: '100' });
      return { ids: (r.messages ?? []).map(m => m.id), nextPageToken: r.nextPageToken };
    },
    getMessage(id) {
      return call<GmailMessage>(`/messages/${encodeURIComponent(id)}`, { format: 'full' });
    },
  };
}
