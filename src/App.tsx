import { lazy, Suspense, useEffect, useState } from 'react';
import { exchangeCodeForToken } from './auth/spotify-pkce';
import { fetchPlaylist } from './services/spotify';
import {
  loadBundledPlaylists,
  mergeBundledTracks,
  useSongStore,
} from './store/songStore';
import MainPage from './pages/MainPage';

const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export type Page = 'main' | 'settings';

export default function App() {
  const {
    isAuthenticated,
    setAccessToken,
    tracks,
    defaultPlaylists,
    customPlaylists,
    userPlaylistSelections,
    accessToken,
    setTracks,
    appendTracks,
  } = useSongStore();
  const [page, setPage] = useState<Page>('main');
  const [authError, setAuthError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);

  // Handle OAuth callback — Spotify redirects back with ?code=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    // Clean up the URL regardless, preserving the Vite base path so GitHub Pages
    // (which serves from /<repo>/) doesn't get bounced to the root domain.
    if (code ?? error) {
      window.history.replaceState({}, '', import.meta.env.BASE_URL);
    }

    if (error) {
      setAuthError(`Spotify login cancelled or failed: ${error}`);
      return;
    }

    if (!code) return;

    setExchanging(true);
    exchangeCodeForToken(code)
      .then(({ accessToken, expiresIn }) => {
        setAccessToken(accessToken, expiresIn);
      })
      .catch((err: unknown) => {
        setAuthError(err instanceof Error ? err.message : 'Token exchange failed');
      })
      .finally(() => {
        setExchanging(false);
      });
    // OAuth callback runs once on mount — no reactive deps needed.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load the bundled default tracks after first paint so the ~1.5 MB JSON
  // ships as its own chunk instead of blocking the initial shell. Then, if the
  // user has saved custom or personal playlists selected, fetch those too and
  // append (the existing 90-day fetchPlaylist cache makes warm loads instant).
  useEffect(() => {
    if (tracks.length > 0) return;
    let cancelled = false;

    loadBundledPlaylists()
      .then((bundled) => {
        if (cancelled) return;
        const { tracks: defaultTracks, names } = mergeBundledTracks(
          bundled,
          defaultPlaylists,
        );
        if (defaultTracks.length > 0) setTracks(defaultTracks, names);
      })
      .catch(() => {
        // Bundled playlist load failed — settings page can still fetch via the API.
      });

    if (accessToken) {
      const enabledCustoms = customPlaylists.filter((p) => p.enabled);
      const personalUrls = userPlaylistSelections.map(
        (id) => `https://open.spotify.com/playlist/${id}`,
      );
      const remoteFetches = [
        ...enabledCustoms.map((p) => fetchPlaylist(p.url, accessToken)),
        ...personalUrls.map((url) => fetchPlaylist(url, accessToken)),
      ];

      for (const promise of remoteFetches) {
        promise
          .then((result) => {
            if (cancelled) return;
            appendTracks(result.tracks, [result.name]);
          })
          .catch(() => {
            // One playlist failing shouldn't break the others.
          });
      }
    }

    return () => {
      cancelled = true;
    };
  }, [
    tracks.length,
    defaultPlaylists,
    customPlaylists,
    userPlaylistSelections,
    accessToken,
    setTracks,
    appendTracks,
  ]);

  if (exchanging) {
    return (
      <div style={styles.fullscreen}>
        <span className="spinner" style={{ width: 40, height: 40 }} />
        <p style={styles.loadingText}>Connecting to Spotify…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <MainPage
        page={page}
        setPage={setPage}
        authError={authError}
        onClearAuthError={() => setAuthError(null)}
      />
    );
  }

  if (page === 'settings') {
    return (
      <Suspense
        fallback={
          <div style={styles.fullscreen}>
            <span className="spinner" style={{ width: 40, height: 40 }} />
          </div>
        }
      >
        <SettingsPage onBack={() => setPage('main')} />
      </Suspense>
    );
  }

  return (
    <MainPage
      page={page}
      setPage={setPage}
      authError={authError}
      onClearAuthError={() => setAuthError(null)}
    />
  );
}

const styles: Record<string, React.CSSProperties> = {
  fullscreen: {
    height: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#0f0f1a',
  },
  loadingText: {
    color: '#b0a8cc',
    fontSize: 15,
  },
};
