/**
 * Pre-fetches the default playlists from Spotify and saves them as bundled JSON.
 *
 * Usage:
 *   node scripts/fetch-default-playlists.mjs <spotify_access_token>
 *
 * Get a token from the Expo console log after logging in.
 * The output file is src/data/defaultTracks.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPOTIFY_API = 'https://api.spotify.com/v1';

const PLAYLISTS = [
  { id: 'top2000', name: 'Top 2000', spotifyId: '0tyaqq5QcCOt6iOru9Kg51' },
  { id: 'fouteur', name: 'Foute Uur', spotifyId: '1SutuoTknFbxL9jVsUxbF2' },
  { id: 'top500_10s', name: "Top 500 10's", spotifyId: '6JpGyIjFccZ6COElPnDZKu' },
  { id: 'top100_10s', name: 'Top 100 over 2010 - 2019', spotifyId: '5IRUuYgi6RaNZ1uuvFXrEj' },
  { id: 'top100_20s', name: 'Top 100 over 2020 - 2025', spotifyId: '01sOMQ6iDHtBk1vzQrHC3k' },
];

const token = process.argv[2];
if (!token) {
  console.error('Usage: node scripts/fetch-default-playlists.mjs <access_token>');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, retries = 5) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429 && retries > 0) {
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10);
    const waitSec = Number.isFinite(retryAfter) ? retryAfter : 5;
    console.log(`  Rate limited — waiting ${waitSec}s before retry (${retries} left)...`);
    await sleep(waitSec * 1000);
    return fetchWithRetry(url, retries - 1);
  }

  return res;
}

async function fetchPlaylist(spotifyId) {
  const res = await fetchWithRetry(
    `${SPOTIFY_API}/playlists/${spotifyId}?fields=name,tracks(items(track(id,name,artists(id,name),album(release_date),uri)),next,total)`
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch ${spotifyId} (${res.status}): ${body}`);
  }

  const playlist = await res.json();
  const tracks = [];

  for (const item of playlist.tracks?.items ?? []) {
    const t = item?.track;
    if (!t?.id) continue;
    tracks.push({
      id: t.id,
      name: t.name,
      artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
      album: { release_date: t.album?.release_date ?? '' },
      uri: t.uri,
      trackUrl: `https://open.spotify.com/track/${t.id}`,
      isGroup: t.artists.length > 1,
    });
  }

  // Paginate
  let nextUrl = playlist.tracks?.next ?? null;
  while (nextUrl) {
    await sleep(500); // small delay between pages
    const pageRes = await fetchWithRetry(nextUrl);
    if (!pageRes.ok) break;
    const page = await pageRes.json();
    for (const item of page.items ?? []) {
      const t = item?.track;
      if (!t?.id) continue;
      tracks.push({
        id: t.id,
        name: t.name,
        artists: t.artists.map((a) => ({ id: a.id, name: a.name })),
        album: { release_date: t.album?.release_date ?? '' },
        uri: t.uri,
        trackUrl: `https://open.spotify.com/track/${t.id}`,
        isGroup: t.artists.length > 1,
      });
    }
    nextUrl = page.next ?? null;
  }

  return { name: playlist.name ?? spotifyId, tracks };
}

async function main() {
  const outDir = path.join(__dirname, '..', 'src', 'data');
  const outPath = path.join(outDir, 'defaultTracks.json');

  // Load existing data so non-script entries (e.g. 'all' from CSV) are preserved
  let existing = {};
  if (fs.existsSync(outPath)) {
    existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    console.log(`Loaded existing data (${Object.keys(existing).length} playlists)`);
  }

  const output = { ...existing };

  // Only fetch playlists that aren't already bundled (skip if already present)
  const toFetch = PLAYLISTS.filter((pl) => !output[pl.id]);
  if (toFetch.length === 0) {
    console.log('All playlists already bundled. Nothing to fetch.');
    return;
  }

  for (const pl of toFetch) {
    console.log(`Fetching ${pl.name} (${pl.spotifyId})...`);
    const result = await fetchPlaylist(pl.spotifyId);
    output[pl.id] = result;
    console.log(`  → ${result.tracks.length} tracks`);
    await sleep(2000); // 2s delay between playlists
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
