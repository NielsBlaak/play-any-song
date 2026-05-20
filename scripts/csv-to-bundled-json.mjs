/**
 * Converts a Spotify CSV export (e.g. from Exportify) into bundled defaultTracks.json.
 * Merges with existing data — does not overwrite other playlists.
 *
 * Usage:
 *   node scripts/csv-to-bundled-json.mjs <path-to-csv> --id <playlist-id> --name <playlist-name>
 *
 * Examples:
 *   node scripts/csv-to-bundled-json.mjs ~/Downloads/top100_10s.csv --id top100_10s --name "Top 100 over 2010 - 2019"
 *   node scripts/csv-to-bundled-json.mjs ~/Downloads/op_een_stokkie.csv --id all --name "Op een stokkie"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith('--'));
const idFlag = args.indexOf('--id');
const nameFlag = args.indexOf('--name');

const playlistId = idFlag !== -1 ? args[idFlag + 1] : null;
const playlistName = nameFlag !== -1 ? args[nameFlag + 1] : null;

if (!csvPath || !playlistId || !playlistName) {
  console.error('Usage: node scripts/csv-to-bundled-json.mjs <path-to-csv> --id <playlist-id> --name <playlist-name>');
  process.exit(1);
}

// Simple CSV parser that handles quoted fields with commas
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
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

const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
const lines = raw.split('\n').filter((l) => l.trim());
const headers = parseCSVLine(lines[0]);

// Find column indices
const colUri = headers.indexOf('Track URI');
const colName = headers.indexOf('Track Name');
const colArtists = headers.indexOf('Artist Name(s)');
const colRelease = headers.indexOf('Release Date');

if (colUri === -1 || colName === -1 || colArtists === -1) {
  console.error('CSV missing required columns: Track URI, Track Name, Artist Name(s)');
  console.error('Found columns:', headers.join(', '));
  process.exit(1);
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

// Load existing bundled data and merge
const outPath = path.join(__dirname, '..', 'src', 'data', 'defaultTracks.json');
let existing = {};
if (fs.existsSync(outPath)) {
  existing = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
}

const output = { ...existing, [playlistId]: { name: playlistName, tracks } };

fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Converted ${tracks.length} unique tracks → stored as "${playlistId}" in ${outPath}`);
