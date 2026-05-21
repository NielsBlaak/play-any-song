/**
 * Enrich src/data/defaultTracks.json by replacing each track's
 * `album.release_date` with the ISRC-derived recording year.
 *
 * Uses the Deezer public search API — no auth required, generous rate limits.
 * Searches by artist + track name and verifies the match before accepting an ISRC.
 *
 * Usage:
 *   node scripts/enrich-bundled-years.mjs [playlist_key]
 *
 * Examples:
 *   node scripts/enrich-bundled-years.mjs            # all playlists (~17 min)
 *   node scripts/enrich-bundled-years.mjs accordeon  # one playlist (~1 min)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const onlyKey = process.argv[2] ?? null;

const DEEZER_API = 'https://api.deezer.com';
const DELAY_MS = 200; // 5 req/s — well within Deezer's limits

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]/g, '');      // keep only alphanumeric
}

async function fetchDeezer(url, retries = 4) {
  const res = await fetch(url);
  if ((res.status === 429 || res.status === 503) && retries > 0) {
    console.log(`\n  Deezer ${res.status} — waiting 3s…`);
    await sleep(3000);
    return fetchDeezer(url, retries - 1);
  }
  return res;
}

function parseIsrcYear(isrc) {
  if (!isrc || isrc.length < 7) return null;
  const yy = parseInt(isrc.substring(5, 7), 10);
  if (!Number.isFinite(yy)) return null;
  const currentYy = new Date().getFullYear() % 100;
  return yy <= currentYy ? 2000 + yy : 1900 + yy;
}

async function getIsrc(trackName, artistName) {
  const q = encodeURIComponent(`${artistName} ${trackName}`);
  const res = await fetchDeezer(`${DEEZER_API}/search?q=${q}&limit=10`);
  await sleep(DELAY_MS);

  if (!res.ok) return null;
  const data = await res.json();
  const results = data.data ?? [];

  const normTitle = normalize(trackName);
  const normArtist = normalize(artistName);

  // Accept the first result where both title and artist are a close match.
  for (const item of results) {
    const t = normalize(item.title ?? '');
    const a = normalize(item.artist?.name ?? '');
    const titleMatch = t === normTitle || t.includes(normTitle) || normTitle.includes(t);
    const artistMatch = a === normArtist || a.includes(normArtist) || normArtist.includes(a);
    if (titleMatch && artistMatch && item.isrc) return item.isrc;
  }

  return null;
}

async function main() {
  const inPath = path.join(__dirname, '..', 'src', 'data', 'defaultTracks.json');
  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));

  let totalTracks = 0;
  let updated = 0;
  let unchanged = 0;
  let notFound = 0;

  for (const [playlistKey, playlist] of Object.entries(data)) {
    if (!playlist?.tracks?.length) continue;
    if (onlyKey && playlistKey !== onlyKey) continue;

    const n = playlist.tracks.length;
    const estMin = Math.ceil((n * DELAY_MS) / 60000);
    console.log(`\nEnriching "${playlist.name}" (${playlistKey}): ${n} tracks (~${estMin} min)`);

    for (let i = 0; i < playlist.tracks.length; i++) {
      const track = playlist.tracks[i];
      totalTracks++;

      const artistName = track.artists?.[0]?.name ?? '';
      const isrc = await getIsrc(track.name, artistName);
      const isrcYear = parseIsrcYear(isrc);

      if (isrcYear == null) {
        notFound++;
      } else {
        const oldYear = (track.album?.release_date ?? '').split('-')[0];
        const newYear = String(isrcYear);
        if (oldYear === newYear) {
          unchanged++;
        } else {
          track.album = { ...(track.album ?? {}), release_date: newYear };
          updated++;
        }
      }

      process.stdout.write(`  ${i + 1}/${n}  updated:${updated}  not found:${notFound}\r`);
    }

    process.stdout.write('\n');
    // Save after each playlist so progress isn't lost on interruption.
    fs.writeFileSync(inPath, JSON.stringify(data, null, 2));
    console.log(`  Saved. Totals — updated:${updated}  unchanged:${unchanged}  not found:${notFound}`);
  }

  console.log(`\nDone. ${updated} updated, ${unchanged} unchanged, ${notFound} not found on Deezer.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
