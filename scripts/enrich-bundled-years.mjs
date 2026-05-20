/**
 * Enrich src/data/defaultTracks.json by replacing each track's
 * `album.release_date` with the ISRC-derived recording year.
 *
 * Why: Spotify's album.release_date returns the date of the ALBUM the track
 * appears on, which for compilations and remasters is the compilation year,
 * not the original. The ISRC's year segment (chars 5–6) is the year of the
 * recording itself — much better for a Hitster-style "guess the year" game.
 *
 * Usage:
 *   node scripts/enrich-bundled-years.mjs <spotify_access_token>
 *
 * Grab a token from devtools while logged into the app:
 *   localStorage.getItem('spotify_access_token')
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPOTIFY_API = 'https://api.spotify.com/v1';

const token = process.argv[2];
if (!token) {
  console.error('Usage: node scripts/enrich-bundled-years.mjs <access_token>');
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
    console.log(`  Rate limited — waiting ${waitSec}s (${retries} retries left)`);
    await sleep(waitSec * 1000);
    return fetchWithRetry(url, retries - 1);
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

async function fetchBatchIsrcs(ids) {
  // /tracks?ids= accepts up to 50 ids
  const url = `${SPOTIFY_API}/tracks?ids=${ids.join(',')}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Batch fetch failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  const result = new Map();
  for (const track of data.tracks ?? []) {
    if (track?.id) result.set(track.id, track.external_ids?.isrc ?? null);
  }
  return result;
}

async function main() {
  const inPath = path.join(__dirname, '..', 'src', 'data', 'defaultTracks.json');
  const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));

  let totalTracks = 0;
  let updated = 0;
  let unchanged = 0;
  let noIsrc = 0;

  for (const [playlistKey, playlist] of Object.entries(data)) {
    if (!playlist?.tracks?.length) continue;
    console.log(`\nEnriching "${playlist.name}" (${playlistKey}): ${playlist.tracks.length} tracks`);

    const ids = playlist.tracks.map((t) => t.id);
    const isrcByTrackId = new Map();

    // Batch in groups of 50
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      const batchMap = await fetchBatchIsrcs(batch);
      for (const [id, isrc] of batchMap) isrcByTrackId.set(id, isrc);
      process.stdout.write(`  ${Math.min(i + 50, ids.length)}/${ids.length}\r`);
      await sleep(150); // small breather between batches
    }
    process.stdout.write('\n');

    for (const track of playlist.tracks) {
      totalTracks++;
      const isrc = isrcByTrackId.get(track.id);
      const isrcYear = parseIsrcYear(isrc);
      if (isrcYear == null) {
        noIsrc++;
        continue;
      }
      const oldYear = (track.album?.release_date ?? '').split('-')[0];
      const newYear = String(isrcYear);
      if (oldYear === newYear) {
        unchanged++;
      } else {
        track.album = { ...(track.album ?? {}), release_date: newYear };
        updated++;
      }
    }
  }

  fs.writeFileSync(inPath, JSON.stringify(data, null, 2));
  console.log(`\nDone. ${updated} tracks updated, ${unchanged} unchanged, ${noIsrc} without ISRC. Saved to ${inPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
