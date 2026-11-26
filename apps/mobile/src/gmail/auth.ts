import {
  GoogleSignin,
  isSuccessResponse,
  isNoSavedCredentialFoundResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

/**
 * Google sign-in with the read-only Gmail permission. No webClientId / offlineAccess:
 * we never want a server-side refresh token — the access token lives on the phone only.
 *
 * Requires an *Android* OAuth client in Google Cloud Console (package name + SHA-1 of
 * the signing key). See apps/mobile/GMAIL_SETUP.md.
 */

export const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ scopes: [GMAIL_READONLY] });
  configured = true;
}

export type ConnectResult =
  | { status: 'connected'; email: string }
  | { status: 'cancelled' }
  | { status: 'missing-permission' }
  | { status: 'error'; message: string };

export async function connectGmail(): Promise<ConnectResult> {
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return { status: 'cancelled' };
    // The user can untick Gmail on the consent screen while still signing in.
    if (!res.data.scopes.includes(GMAIL_READONLY)) {
      const added = await GoogleSignin.addScopes({ scopes: [GMAIL_READONLY] });
      if (!added || !isSuccessResponse(added) || !added.data.scopes.includes(GMAIL_READONLY)) {
        return { status: 'missing-permission' };
      }
    }
    return { status: 'connected', email: res.data.user.email };
  } catch (e) {
    if (isErrorWithCode(e) && e.code === statusCodes.IN_PROGRESS) return { status: 'error', message: 'Sign-in already in progress' };
    if (isErrorWithCode(e) && e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) return { status: 'error', message: 'Google Play Services unavailable' };
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** Silent restore at app start / in the background task. Returns the email if still connected. */
export async function restoreGmail(): Promise<string | null> {
  ensureConfigured();
  if (!GoogleSignin.hasPreviousSignIn()) return null;
  const res = await GoogleSignin.signInSilently();
  if (isNoSavedCredentialFoundResponse(res)) return null;
  return res.data.scopes.includes(GMAIL_READONLY) ? res.data.user.email : null;
}

/** Cheap synchronous check (no network): has the user connected Gmail on this device? */
export function isGmailConnected(): boolean {
  ensureConfigured();
  return GoogleSignin.hasPreviousSignIn();
}

/** Fresh access token (the library refreshes it when expired). */
export async function getAccessToken(): Promise<string> {
  ensureConfigured();
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
}

/** Called on HTTP 401 so the next getTokens() returns a new token. */
export async function invalidateToken(token: string): Promise<void> {
  await GoogleSignin.clearCachedAccessToken(token);
}

/** Disconnect fully: revokes our Gmail access at Google, not just a local sign-out. */
export async function disconnectGmail(): Promise<void> {
  ensureConfigured();
  try {
    await GoogleSignin.revokeAccess();
  } finally {
    await GoogleSignin.signOut();
  }
}
