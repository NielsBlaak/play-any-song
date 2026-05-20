import { useEffect, useState } from 'react';
import { clearStoredToken } from '../auth/spotify-pkce';
import {
  extractPlaylistId,
  fetchPlaylist,
  fetchPlaylistName,
  fetchUserPlaylists,
  type PlaylistResult,
  type UserPlaylist,
} from '../services/spotify';
import { loadBundledPlaylists, useSongStore } from '../store/songStore';
import { colors } from '../theme/colors';

interface Props {
  onBack: () => void;
}

export default function SettingsPage({ onBack }: Props) {
  const {
    defaultPlaylists,
    toggleDefaultPlaylist,
    customPlaylists,
    addCustomPlaylist,
    removeCustomPlaylist,
    toggleCustomPlaylist,
    userPlaylistSelections,
    toggleUserPlaylistSelection,
    setTracks,
    setAccessToken,
    accessToken,
    tracks,
    loadedNames,
  } = useSongStore();

  const [customUrl, setCustomUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>([]);
  const [userPlaylistsLoading, setUserPlaylistsLoading] = useState(false);
  const [userPlaylistsError, setUserPlaylistsError] = useState<string | null>(null);

  const hasLoaded = tracks.length > 0;

  // Refresh the user's Spotify playlists every time Settings opens.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setUserPlaylistsLoading(true);
    setUserPlaylistsError(null);
    fetchUserPlaylists(accessToken)
      .then((list) => {
        if (!cancelled) setUserPlaylists(list);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setUserPlaylistsError(
          err instanceof Error ? err.message : 'Could not load your playlists',
        );
      })
      .finally(() => {
        if (!cancelled) setUserPlaylistsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleAddCustom() {
    const url = customUrl.trim();
    if (!url) return;
    const id = extractPlaylistId(url);
    if (!id) {
      setError('That doesn’t look like a Spotify playlist URL.');
      return;
    }
    setError(null);
    setAdding(true);
    try {
      let name = url;
      if (accessToken) {
        try {
          name = await fetchPlaylistName(url, accessToken);
        } catch {
          // Couldn't resolve — fall back to URL string.
        }
      }
      addCustomPlaylist({ id, url, name, enabled: true });
      setCustomUrl('');
    } finally {
      setAdding(false);
    }
  }

  async function handleLoad() {
    const enabledDefaults = defaultPlaylists.filter((p) => p.enabled);
    const enabledCustoms = customPlaylists.filter((p) => p.enabled);
    const selectedUser = userPlaylists.filter((p) =>
      userPlaylistSelections.includes(p.id),
    );

    if (
      enabledDefaults.length === 0 &&
      enabledCustoms.length === 0 &&
      selectedUser.length === 0
    ) {
      setError('Pick at least one playlist to load.');
      return;
    }

    const needsApi = enabledCustoms.length > 0 || selectedUser.length > 0;
    if (needsApi && !accessToken) {
      setError('Log in with Spotify first to load custom or personal playlists.');
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

      if (accessToken) {
        for (const p of enabledCustoms) {
          results.push(await fetchPlaylist(p.url, accessToken));
        }
        for (const p of selectedUser) {
          results.push(await fetchPlaylist(p.url, accessToken));
        }
      }

      const seen = new Set<string>();
      const merged = results
        .flatMap((r) => r.tracks)
        .filter((track) => {
          if (seen.has(track.id)) return false;
          seen.add(track.id);
          return true;
        });

      setTracks(
        merged,
        results.map((r) => r.name),
      );
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

  const totalSources =
    defaultPlaylists.filter((p) => p.enabled).length +
    customPlaylists.filter((p) => p.enabled).length +
    userPlaylistSelections.length;

  return (
    <div style={s.screen}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={onBack}>
          ← Back
        </button>
        <h1 style={s.title}>Song Pool</h1>
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

        {/* Default Playlists */}
        <p style={s.sectionTitle}>Default playlists</p>
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

        {/* Your Spotify Playlists */}
        <p style={{ ...s.sectionTitle, marginTop: 24 }}>Your Spotify playlists</p>
        {!accessToken && (
          <p style={s.hintText}>Log in with Spotify to see your playlists here.</p>
        )}
        {accessToken && userPlaylistsLoading && (
          <div style={s.centerBox}>
            <span className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        )}
        {accessToken && userPlaylistsError && (
          <div style={s.errorBox}>
            <p style={s.errorText}>{userPlaylistsError}</p>
          </div>
        )}
        {accessToken &&
          !userPlaylistsLoading &&
          !userPlaylistsError &&
          userPlaylists.length === 0 && (
            <p style={s.hintText}>You don’t have any playlists yet.</p>
          )}
        {accessToken &&
          userPlaylists.map((playlist) => {
            const enabled = userPlaylistSelections.includes(playlist.id);
            return (
              <div
                key={playlist.id}
                style={{ ...s.row, ...(!enabled ? s.rowDisabled : {}) }}
              >
                <PlaylistThumb url={playlist.imageUrl} name={playlist.name} />
                <div style={s.rowText}>
                  <span style={{ ...s.rowName, ...(!enabled ? s.rowNameMuted : {}) }}>
                    {playlist.name}
                  </span>
                  <span style={s.rowMeta}>
                    {playlist.trackCount} tracks · {playlist.ownerName}
                  </span>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleUserPlaylistSelection(playlist.id)}
                    aria-label={`Include ${playlist.name} in song pool`}
                  />
                  <span className="toggle-track" />
                  <span className="toggle-thumb" />
                </label>
              </div>
            );
          })}

        {/* Custom Playlists (saved) */}
        {customPlaylists.length > 0 && (
          <>
            <p style={{ ...s.sectionTitle, marginTop: 24 }}>Custom playlists</p>
            {customPlaylists.map((playlist) => (
              <div
                key={playlist.id}
                style={{ ...s.row, ...(!playlist.enabled ? s.rowDisabled : {}) }}
              >
                <span
                  style={{ ...s.rowName, ...(!playlist.enabled ? s.rowNameMuted : {}) }}
                >
                  {playlist.name}
                </span>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={playlist.enabled}
                    onChange={() => toggleCustomPlaylist(playlist.id)}
                    aria-label={`Include ${playlist.name} in song pool`}
                  />
                  <span className="toggle-track" />
                  <span className="toggle-thumb" />
                </label>
                <button
                  style={s.removeBtn}
                  onClick={() => removeCustomPlaylist(playlist.id)}
                  aria-label={`Remove ${playlist.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </>
        )}

        {/* Add custom playlist URL */}
        <p style={{ ...s.sectionTitle, marginTop: 24 }}>Add a custom playlist URL</p>
        <div style={s.addRow}>
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
          <button
            style={{
              ...s.addBtn,
              ...(adding || !customUrl.trim() ? s.disabled : {}),
            }}
            onClick={() => {
              void handleAddCustom();
            }}
            disabled={adding || !customUrl.trim()}
          >
            {adding ? <span className="spinner spinner--dark" /> : 'Add'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={s.errorBox}>
            <p style={s.errorText}>{error}</p>
          </div>
        )}

        {/* Load button */}
        <button
          style={{ ...s.loadBtn, ...(loading ? s.disabled : {}) }}
          onClick={() => {
            void handleLoad();
          }}
          disabled={loading}
        >
          {loading ? (
            <span className="spinner spinner--dark" />
          ) : (
            `${hasLoaded ? 'Reload' : 'Load'} ${
              totalSources > 1 ? `${totalSources} playlists` : 'playlist'
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

function PlaylistThumb({ url, name }: { url: string | null; name: string }) {
  const [errored, setErrored] = useState(false);
  if (url && !errored) {
    return (
      <img
        src={url}
        width={40}
        height={40}
        loading="lazy"
        alt=""
        onError={() => setErrored(true)}
        style={s.thumb}
      />
    );
  }
  return (
    <div style={s.thumbFallback} aria-hidden>
      {name.charAt(0).toUpperCase() || '?'}
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
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 12,
    marginBottom: 8,
    border: `1px solid ${colors.border}`,
    transition: 'opacity 0.15s',
  },
  rowDisabled: { opacity: 0.5 },
  rowText: { display: 'flex', flexDirection: 'column', flex: 1, gap: 2, minWidth: 0 },
  rowName: {
    fontSize: 15,
    fontWeight: 600,
    color: colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowNameMuted: { color: colors.textMuted },
  rowMeta: {
    fontSize: 12,
    color: colors.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  removeBtn: {
    background: 'none',
    color: colors.textMuted,
    fontSize: 22,
    lineHeight: 1,
    padding: 4,
    marginLeft: 4,
  },

  thumb: { borderRadius: 6, flexShrink: 0, objectFit: 'cover' },
  thumbFallback: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.surfaceElevated,
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  centerBox: {
    display: 'flex',
    justifyContent: 'center',
    padding: 16,
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: 13,
    padding: '4px 4px 12px',
  },

  addRow: { display: 'flex', gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: colors.textPrimary,
    minWidth: 0,
  },
  addBtn: {
    backgroundColor: colors.pastelLavender,
    color: colors.background,
    borderRadius: 12,
    paddingLeft: 18,
    paddingRight: 18,
    fontSize: 14,
    fontWeight: 700,
    flexShrink: 0,
    transition: 'opacity 0.15s',
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
