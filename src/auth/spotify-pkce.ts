const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string;

// Build the redirect URI from origin + Vite's BASE_URL so it matches in dev
// (http://127.0.0.1:5173/) and on GitHub Pages (https://<user>.github.io/play-any-song/).
// Spotify requires an exact match to a Redirect URI registered in the dashboard.
const REDIRECT_URI = `${window.location.origin}${import.meta.env.BASE_URL}`;

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ');

const VERIFIER_KEY = 'spotify_pkce_verifier';
export const TOKEN_KEY = 'spotify_access_token';
export const TOKEN_EXPIRY_KEY = 'spotify_token_expiry';

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function generateVerifier(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars.charAt(b % chars.length)).join('');
}

async function generateChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function redirectToSpotifyLogin(): Promise<void> {
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);

  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    prompt: 'consent',
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCodeForToken(
  code: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('No PKCE verifier — please log in again.');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  sessionStorage.removeItem(VERIFIER_KEY);
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/** Returns a stored, non-expired token or null. */
export function getStoredToken(): string | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return null;
  // 5-minute buffer so we don't use a token that's about to expire
  if (Date.now() > parseInt(expiry) - 5 * 60 * 1000) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    return null;
  }
  return token;
}

export function storeToken(accessToken: string, expiresIn: number): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + expiresIn * 1000));
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}
