import { useState } from 'react';
import { clearStoredToken } from '../auth/spotify-pkce';
import { fetchPlaylist, type PlaylistResult } from '../services/spotify';
import { loadBundledPlaylists, useSongStore } from '../store/songStore';
import { colors } from '../theme/colors';

interface Props {
  onBack: () => void;
}

export default function SettingsPage({ onBack }: Props) {
  const {
    defaultPlaylists,
    toggleDefaultPlaylist,
    setTracks,
    setAccessToken,
    accessToken,
    tracks,
    loadedNames,
  } = useSongStore();

  const [customUrl, setCustomUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabledDefaults = defaultPlaylists.filter((p) => p.enabled);
  const customUrlTrimmed = customUrl.trim();
  const needsApi = customUrlTrimmed.length > 0;
  const totalSources = enabledDefaults.length + (customUrlTrimmed ? 1 : 0);
  const hasLoaded = tracks.length > 0;

  async function handleLoad() {
    if (enabledDefaults.length === 0 && !customUrlTrimmed) {
      setError('Enable at least one playlist or enter a custom URL.');
      return;
    }

    if (needsApi && !accessToken) {
      setError('Please log in with Spotify first to load custom playlists.');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const bundled = await loadBundledPlaylists();
      const results: PlaylistResult[] = [];

      for (const p of enabledDefaults) {
        const data = bundled[p.id];
        if (data?.tracks?.length) {
          results.push(data);
        } else if (accessToken) {
          results.push(await fetchPlaylist(p.url, accessToken));
        }
      }

      if (customUrlTrimmed && accessToken) {
        results.push(await fetchPlaylist(customUrlTrimmed, accessToken));
      }

      const seen = new Set<string>();
      const merged = results
        .flatMap((r) => r.tracks)
        .filter((track) => {
          if (seen.has(track.id)) return false;
          seen.add(track.id);
          return true;
        });

      setTracks(merged, results.map((r) => r.name));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    setAccessToken(null);
    clearStoredToken();
    onBack();
  }

  return (
    <div style={s.screen}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={onBack}>
          ← Back
        </button>
        <h1 style={s.title}>Song Pool</h1>
        {/* Spacer to balance the back button */}
        <div style={{ width: 70 }} />
      </div>

      {/* Scrollable content */}
      <div style={s.scrollArea}>
        {/* Status */}
        {hasLoaded && (
          <div style={s.statusBar}>
            <p style={s.statusText}>{tracks.length} songs loaded</p>
            {loadedNames.length > 0 && (
              <p style={s.statusSources}>{loadedNames.join('  ·  ')}</p>
            )}
          </div>
        )}

        {/* Playlists */}
        <p style={s.sectionTitle}>Playlists</p>

        {defaultPlaylists.map((playlist) => (
          <div
            key={playlist.id}
            style={{ ...s.row, ...(!playlist.enabled ? s.rowDisabled : {}) }}
          >
            <span style={{ ...s.rowName, ...(!playlist.enabled ? s.rowNameMuted : {}) }}>
              {playlist.name}
            </span>

            <label className="toggle">
              <input
                type="checkbox"
                checked={playlist.enabled}
                onChange={() => toggleDefaultPlaylist(playlist.id)}
                aria-label={`Include ${playlist.name} in song pool`}
              />
              <span className="toggle-track" />
              <span className="toggle-thumb" />
            </label>
          </div>
        ))}

        {/* Custom URL */}
        <p style={{ ...s.sectionTitle, marginTop: 20 }}>Add Custom Playlist</p>
        <input
          style={s.input}
          type="url"
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          placeholder="Paste Spotify playlist URL…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />

        {/* Error */}
        {error && (
          <div style={s.errorBox}>
            <p style={s.errorText}>{error}</p>
          </div>
        )}

        {/* Load button */}
        <button
          style={{ ...s.loadBtn, ...(loading ? s.disabled : {}) }}
          onClick={() => { void handleLoad(); }}
          disabled={loading}
        >
          {loading ? (
            <span className="spinner spinner--dark" />
          ) : (
            `${hasLoaded ? 'Reload' : 'Load'} ${
              totalSources > 1 ? `${totalSources} Playlists` : 'Playlist'
            }`
          )}
        </button>

        <div style={{ height: 32 }} />

        {/* Logout */}
        <button style={s.logoutBtn} onClick={handleLogout}>
          Log out
        </button>

        <div style={{ height: 32 }} />
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  screen: {
    height: '100dvh',
    backgroundColor: colors.background,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 480,
    paddingLeft: 24,
    paddingRight: 24,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottom: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  backBtn: {
    background: 'none',
    color: colors.pastelLavender,
    fontSize: 15,
    fontWeight: 600,
    width: 70,
    textAlign: 'left',
  },
  title: {
    fontSize: 20,
    fontWeight: 800,
    color: colors.textPrimary,
    textAlign: 'center',
  },

  scrollArea: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    overflowY: 'auto',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
  },

  statusBar: {
    backgroundColor: colors.pastelMint + '15',
    border: `1px solid ${colors.pastelMint}44`,
    borderRadius: 14,
    padding: 14,
    marginBottom: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
  },
  statusText: { color: colors.pastelMint, fontSize: 15, fontWeight: 700 },
  statusSources: {
    color: colors.pastelMint + 'aa',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 1.5,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 8,
    border: `1px solid ${colors.border}`,
    transition: 'opacity 0.15s',
  },
  rowDisabled: { opacity: 0.5 },
  rowName: { fontSize: 15, fontWeight: 600, color: colors.textPrimary, flex: 1 },
  rowNameMuted: { color: colors.textMuted },

  input: {
    backgroundColor: colors.surfaceElevated,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 16,
    width: '100%',
  },

  errorBox: {
    backgroundColor: '#2e1a1a',
    border: `1px solid ${colors.danger}`,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 1.5 },

  loadBtn: {
    backgroundColor: colors.primary,
    color: colors.background,
    borderRadius: 14,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 15,
    fontWeight: 700,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.15s',
  },

  logoutBtn: {
    background: 'none',
    border: `1px solid ${colors.danger}66`,
    borderRadius: 14,
    paddingTop: 14,
    paddingBottom: 14,
    color: colors.danger,
    fontSize: 14,
    fontWeight: 600,
    width: '100%',
    transition: 'opacity 0.15s',
  },

  disabled: { opacity: 0.5, pointerEvents: 'none' },
};
