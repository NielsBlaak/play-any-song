/**
 * Batch-converts all CSV files in src/csv/ into src/data/defaultTracks.json.
 * CSV files can have any name — the FILENAME_TO_ID map below controls what ID
 * they get in the JSON. IDs must match DEFAULT_PLAYLISTS in songStore.ts.
 *
 * Usage:
 *   node scripts/build-bundled-tracks.mjs
 *
 * CSV format: Exportify export (columns: Track URI, Track Name, Artist Name(s), Release Date)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_DIR = path.join(__dirname, '..', 'src', 'csv');
const OUT_PATH = path.join(__dirname, '..', 'src', 'data', 'defaultTracks.json');

// Maps the CSV filename stem (without .csv) → clean playlist ID used in songStore.ts
// Add a new entry here whenever you add a new CSV from Exportify.
const FILENAME_TO_ID = {
  'NPO_Radio_2_•_TOP_2000_(2025)':              'top2000',
  'De_officiële_Foute_1500_editie_2025_Qmusic': 'fouteur',
  'Lossss_accordeon_style':                     'accordeon',
  'Top_100_over_2010_-_2019':                   'top100_10s',
  'Top_100_over_2020_-_2025':                   'top100_20s',
};

// Playlist display names — must match DEFAULT_PLAYLISTS in songStore.ts
const PLAYLIST_NAMES = {
  top2000:    'Top 2000 - 2025',
  fouteur:    'Foute uur 1500 - 2025',
  accordeon:  'Lossss accordeon style',
  top100_10s: 'Top 100 over 2010 - 2019',
  top100_20s: 'Top 100 over 2020 - 2025',
};

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function convertCSV(csvPath, playlistId, playlistName) {
  const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
  const lines = raw.split('\n').filter((l) => l.trim());
  const headers = parseCSVLine(lines[0]);

  const colUri     = headers.indexOf('Track URI');
  const colName    = headers.indexOf('Track Name');
  const colArtists = headers.indexOf('Artist Name(s)');
  const colRelease = headers.indexOf('Release Date');

  if (colUri === -1 || colName === -1 || colArtists === -1) {
    console.error(`  ✗ Missing required columns. Found: ${headers.join(', ')}`);
    return null;
  }

  const tracks = [];
  const seen = new Set();

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    const uri = fields[colUri]?.trim();
    if (!uri || !uri.startsWith('spotify:track:')) continue;

    const id = uri.split(':')[2];
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const rawArtists = fields[colArtists] ?? '';
    const artistNames = rawArtists.includes(';')
      ? rawArtists.split(';').map((s) => s.trim())
      : rawArtists.split(', ');
    const artists = artistNames.map((name, idx) => ({
      id: `artist_${idx}`,
      name: name.trim(),
    }));

    tracks.push({
      id,
      name: fields[colName] ?? '',
      artists,
      album: { release_date: fields[colRelease] ?? '' },
      uri,
      trackUrl: `https://open.spotify.com/track/${id}`,
      isGroup: artists.length > 1,
    });
  }

  console.log(`  ✓ ${tracks.length} tracks`);
  return { name: playlistName, tracks };
}

function main() {
  if (!fs.existsSync(CSV_DIR)) {
    console.error(`CSV folder not found: ${CSV_DIR}`);
    console.error('Create src/csv/ and put your Exportify CSV files there.');
    process.exit(1);
  }

  const csvFiles = fs.readdirSync(CSV_DIR).filter((f) => f.endsWith('.csv'));
  if (csvFiles.length === 0) {
    console.error('No CSV files found in src/csv/');
    process.exit(1);
  }

  const output = {};

  for (const file of csvFiles) {
    const stem = path.basename(file, '.csv');
    const id = FILENAME_TO_ID[stem] ?? stem;
    const name = PLAYLIST_NAMES[id] ?? id;
    console.log(`Processing ${file} → id: "${id}", name: "${name}"`);
    const result = convertCSV(path.join(CSV_DIR, file), id, name);
    if (result) output[id] = result;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));

  const total = Object.values(output).reduce((sum, p) => sum + p.tracks.length, 0);
  console.log(`\nSaved ${Object.keys(output).length} playlists, ${total} total tracks → ${OUT_PATH}`);
}

main();
