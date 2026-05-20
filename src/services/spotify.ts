const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { release_date: string };
  uri: string;
  trackUrl: string;
  isGroup: boolean;
}

export interface PlaylistResult {
  name: string;
  tracks: SpotifyTrack[];
}

// ─── Retry helper (handles 429 Too Many Requests) ────────────────────────────

const MAX_RETRIES = 3;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  const res = await fetch(url, options);

  if (res.status === 429 && retries > 0) {
    const header = res.headers.get('Retry-After');
    const parsed = header ? Number.parseInt(header, 10) : NaN;
    const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return fetchWithRetry(url, options, retries - 1);
  }

  return res;
}

// ─── Persistent playlist cache (localStorage) ────────────────────────────────

const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 3 months
const CACHE_KEY_PREFIX = 'playlist_cache:';

interface CacheEntry {
  result: PlaylistResult;
  timestamp: number;
}

export function clearPlaylistCache(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith(CACHE_KEY_PREFIX)) localStorage.removeItem(key);
  }
}

function getCached(playlistId: string): PlaylistResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + playlistId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_PREFIX + playlistId);
      return null;
    }
    return entry.result;
  } catch {
    return null;
  }
}

function setCache(playlistId: string, result: PlaylistResult): void {
  try {
    const entry: CacheEntry = { result, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY_PREFIX + playlistId, JSON.stringify(entry));
  } catch {
    // localStorage quota exceeded — silently skip caching
  }
}

// ─── Playlist fetching ───────────────────────────────────────────────────────

interface RawArtist {
  id: string;
  name: string;
}

interface RawTrack {
  id: string;
  name: string;
  artists: RawArtist[];
  album?: { release_date?: string };
  uri: string;
}

interface PaginatedTracksResponse {
  items: ({ track: RawTrack | null } | null)[];
  next: string | null;
}

interface PlaylistResponse {
  name?: string;
  tracks?: {
    items?: ({ track: RawTrack | null } | null)[];
    next?: string | null;
  };
}

export function extractPlaylistId(url: string): string | null {
  const match = url.match(/(?:playlist[/:]|playlist\/)([a-zA-Z0-9]+)/);
  return match ? (match[1] ?? null) : null;
}

export function extractTrackId(url: string): string | null {
  const patterns = [
    /spotify\.com\/track\/([a-zA-Z0-9]+)/,
    /spotify:track:([a-zA-Z0-9]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1] ?? null;
  }
  return null;
}

function parseTrack(t: RawTrack): SpotifyTrack {
  return {
    id: t.id,
    name: t.name,
    artists: t.artists,
    album: { release_date: t.album?.release_date ?? '' },
    uri: t.uri,
    trackUrl: `https://open.spotify.com/track/${t.id}`,
    isGroup: t.artists.length > 1,
  };
}

/**
 * Fetches a playlist's name and all tracks. Results are cached in localStorage.
 */
export async function fetchPlaylist(
  playlistUrl: string,
  accessToken: string,
): Promise<PlaylistResult> {
  const playlistId = extractPlaylistId(playlistUrl);
  if (!playlistId) throw new Error('Invalid Spotify playlist URL');

  const cached = getCached(playlistId);
  if (cached) return cached;

  const headers = { Authorization: `Bearer ${accessToken}` };

  const res = await fetchWithRetry(
    `${SPOTIFY_API_BASE}/playlists/${playlistId}?fields=name,tracks(items(track(id,name,artists(id,name),album(release_date),uri)),next,total)`,
    { headers },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Playlist fetch failed (${res.status}): ${body}`);
  }

  const playlist = (await res.json()) as PlaylistResponse;
  const name: string = playlist.name ?? playlistUrl;
  const tracks: SpotifyTrack[] = [];

  for (const item of playlist.tracks?.items ?? []) {
    const t = item?.track;
    if (!t?.id) continue;
    tracks.push(parseTrack(t));
  }

  let nextUrl: string | null = playlist.tracks?.next ?? null;
  while (nextUrl) {
    const pageRes = await fetchWithRetry(nextUrl, { headers });
    if (!pageRes.ok) break;
    const page = (await pageRes.json()) as PaginatedTracksResponse;
    for (const item of page.items ?? []) {
      const t = item?.track;
      if (!t?.id) continue;
      tracks.push(parseTrack(t));
    }
    nextUrl = page.next ?? null;
  }

  const result: PlaylistResult = { name, tracks };
  setCache(playlistId, result);
  return result;
}

export async function fetchPlaylistTracks(
  playlistUrl: string,
  accessToken: string,
): Promise<SpotifyTrack[]> {
  return (await fetchPlaylist(playlistUrl, accessToken)).tracks;
}

export async function fetchPlaylistName(
  playlistUrl: string,
  accessToken: string,
): Promise<string> {
  return (await fetchPlaylist(playlistUrl, accessToken)).name;
}

// ─── User playlists ──────────────────────────────────────────────────────────

export interface UserPlaylist {
  id: string;
  name: string;
  url: string;
  imageUrl: string | null;
  trackCount: number;
  ownerName: string;
}

interface RawUserPlaylist {
  id: string;
  name: string;
  images?: { url: string }[] | null;
  tracks?: { total?: number };
  owner?: { display_name?: string };
  external_urls?: { spotify?: string };
}

interface UserPlaylistsResponse {
  items?: RawUserPlaylist[];
  next?: string | null;
}

/**
 * Fetch every playlist the current user owns or follows. Paginates through
 * `/me/playlists` 50 at a time. Requires `playlist-read-private` and
 * `playlist-read-collaborative` scopes (already requested by the auth flow).
 */
export async function fetchUserPlaylists(accessToken: string): Promise<UserPlaylist[]> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const result: UserPlaylist[] = [];

  let url: string | null = `${SPOTIFY_API_BASE}/me/playlists?limit=50`;
  while (url) {
    const res: Response = await fetchWithRetry(url, { headers });
    if (!res.ok) {
      throw new Error(`Failed to load your playlists (${res.status})`);
    }
    const page = (await res.json()) as UserPlaylistsResponse;
    for (const p of page.items ?? []) {
      if (!p?.id) continue;
      // Spotify returns images largest-first; the last entry is the smallest
      // thumbnail, ideal for a 40-px row icon.
      const images = p.images ?? [];
      const imageUrl = images[images.length - 1]?.url ?? null;
      result.push({
        id: p.id,
        name: p.name,
        url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`,
        imageUrl,
        trackCount: p.tracks?.total ?? 0,
        ownerName: p.owner?.display_name ?? '',
      });
    }
    url = page.next ?? null;
  }

  return result;
}

// ─── Player API ──────────────────────────────────────────────────────────────

export interface PlaybackDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
}

async function playerFetch(
  endpoint: string,
  method: string,
  accessToken: string,
  body?: object,
): Promise<Response> {
  return fetchWithRetry(`${SPOTIFY_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function playTrack(
  trackUri: string,
  accessToken: string,
  deviceId?: string,
): Promise<void> {
  const endpoint = deviceId
    ? `/me/player/play?device_id=${deviceId}`
    : '/me/player/play';

  const res = await playerFetch(endpoint, 'PUT', accessToken, { uris: [trackUri] });

  if (res.status === 401) {
    throw new Error('Session expired. Please log out and log in again.');
  }
  if (res.status === 404) {
    throw new Error(
      'No active Spotify device found. Open Spotify on any device first, then try again.',
    );
  }
  if (res.status === 403) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { reason?: string; message?: string };
    };
    const reason = body.error?.reason;
    if (reason === 'PREMIUM_REQUIRED') {
      throw new Error('Spotify Premium is required to control playback.');
    }
    throw new Error(
      `Spotify rejected playback${reason ? ` (${reason})` : ''}. If you have Premium, ` +
        'the app owner needs to add your Spotify email under Dashboard → ' +
        'User Management (this app runs in dev mode, max 5 users).',
    );
  }
  if (!res.ok && res.status !== 204) {
    throw new Error(`Playback failed (${res.status}).`);
  }
}

export async function getAvailableDevices(
  accessToken: string,
): Promise<PlaybackDevice[]> {
  const res = await playerFetch('/me/player/devices', 'GET', accessToken);
  if (!res.ok) return [];
  const data = (await res.json()) as { devices?: PlaybackDevice[] };
  return data.devices ?? [];
}

/**
 * Poll for an available Spotify device. Returns the first device found (active
 * preferred), or null on timeout. Used to wake playback after the user opens
 * the Spotify app — Spotify registers it as a device within a few seconds.
 */
export async function waitForDevice(
  accessToken: string,
  timeoutMs = 8000,
  intervalMs = 1000,
): Promise<PlaybackDevice | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const devices = await getAvailableDevices(accessToken);
    if (devices.length > 0) {
      return devices.find((d) => d.is_active) ?? devices[0] ?? null;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

export async function pausePlayback(accessToken: string): Promise<void> {
  await playerFetch('/me/player/pause', 'PUT', accessToken);
}

export async function resumePlayback(accessToken: string): Promise<void> {
  await playerFetch('/me/player/play', 'PUT', accessToken);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getTrackYear(track: SpotifyTrack): string {
  return track.album.release_date?.split('-')[0] ?? '????';
}

export function getArtistNames(track: SpotifyTrack): string {
  return track.artists.map((a) => a.name).join(', ');
}

export function pickRandom<T>(arr: T[]): T | null {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)] ?? null;
}
