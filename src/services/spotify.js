const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
// ─── Retry helper (handles 429 Too Many Requests) ────────────────────────────
const MAX_RETRIES = 3;
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
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
export function clearPlaylistCache() {
    for (const key of Object.keys(localStorage)) {
        if (key.startsWith(CACHE_KEY_PREFIX))
            localStorage.removeItem(key);
    }
}
function getCached(playlistId) {
    try {
        const raw = localStorage.getItem(CACHE_KEY_PREFIX + playlistId);
        if (!raw)
            return null;
        const entry = JSON.parse(raw);
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            localStorage.removeItem(CACHE_KEY_PREFIX + playlistId);
            return null;
        }
        return entry.result;
    }
    catch {
        return null;
    }
}
function setCache(playlistId, result) {
    try {
        const entry = { result, timestamp: Date.now() };
        localStorage.setItem(CACHE_KEY_PREFIX + playlistId, JSON.stringify(entry));
    }
    catch {
        // localStorage quota exceeded — silently skip caching
    }
}
export function extractPlaylistId(url) {
    const match = url.match(/(?:playlist[/:]|playlist\/)([a-zA-Z0-9]+)/);
    return match ? (match[1] ?? null) : null;
}
export function extractTrackId(url) {
    const patterns = [
        /spotify\.com\/track\/([a-zA-Z0-9]+)/,
        /spotify:track:([a-zA-Z0-9]+)/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m)
            return m[1] ?? null;
    }
    return null;
}
function parseTrack(t) {
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
export async function fetchPlaylist(playlistUrl, accessToken) {
    const playlistId = extractPlaylistId(playlistUrl);
    if (!playlistId)
        throw new Error('Invalid Spotify playlist URL');
    const cached = getCached(playlistId);
    if (cached)
        return cached;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const res = await fetchWithRetry(`${SPOTIFY_API_BASE}/playlists/${playlistId}?fields=name,tracks(items(track(id,name,artists(id,name),album(release_date),uri)),next,total)`, { headers });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Playlist fetch failed (${res.status}): ${body}`);
    }
    const playlist = (await res.json());
    const name = playlist.name ?? playlistUrl;
    const tracks = [];
    for (const item of playlist.tracks?.items ?? []) {
        const t = item?.track;
        if (!t?.id)
            continue;
        tracks.push(parseTrack(t));
    }
    let nextUrl = playlist.tracks?.next ?? null;
    while (nextUrl) {
        const pageRes = await fetchWithRetry(nextUrl, { headers });
        if (!pageRes.ok)
            break;
        const page = (await pageRes.json());
        for (const item of page.items ?? []) {
            const t = item?.track;
            if (!t?.id)
                continue;
            tracks.push(parseTrack(t));
        }
        nextUrl = page.next ?? null;
    }
    const result = { name, tracks };
    setCache(playlistId, result);
    return result;
}
export async function fetchPlaylistTracks(playlistUrl, accessToken) {
    return (await fetchPlaylist(playlistUrl, accessToken)).tracks;
}
export async function fetchPlaylistName(playlistUrl, accessToken) {
    return (await fetchPlaylist(playlistUrl, accessToken)).name;
}
// ─── Player API ──────────────────────────────────────────────────────────────
async function playerFetch(endpoint, method, accessToken, body) {
    return fetchWithRetry(`${SPOTIFY_API_BASE}${endpoint}`, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}
export async function playTrack(trackUri, accessToken, deviceId) {
    const endpoint = deviceId
        ? `/me/player/play?device_id=${deviceId}`
        : '/me/player/play';
    const res = await playerFetch(endpoint, 'PUT', accessToken, { uris: [trackUri] });
    if (res.status === 401) {
        throw new Error('Session expired. Please log out and log in again.');
    }
    if (res.status === 404) {
        throw new Error('No active Spotify device found. Open Spotify on any device first, then try again.');
    }
    if (res.status === 403) {
        throw new Error('Spotify Premium is required to control playback.');
    }
    if (!res.ok && res.status !== 204) {
        throw new Error(`Playback failed (${res.status}).`);
    }
}
export async function pausePlayback(accessToken) {
    await playerFetch('/me/player/pause', 'PUT', accessToken);
}
export async function resumePlayback(accessToken) {
    await playerFetch('/me/player/play', 'PUT', accessToken);
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
export function getTrackYear(track) {
    return track.album.release_date?.split('-')[0] ?? '????';
}
export function getArtistNames(track) {
    return track.artists.map((a) => a.name).join(', ');
}
export function pickRandom(arr) {
    if (!arr.length)
        return null;
    return arr[Math.floor(Math.random() * arr.length)] ?? null;
}
