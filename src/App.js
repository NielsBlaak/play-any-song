import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { lazy, Suspense, useEffect, useState } from 'react';
import { exchangeCodeForToken } from './auth/spotify-pkce';
import { loadBundledPlaylists, mergeBundledTracks, useSongStore, } from './store/songStore';
import MainPage from './pages/MainPage';
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
export default function App() {
    const { isAuthenticated, setAccessToken, tracks, defaultPlaylists, setTracks } = useSongStore();
    const [page, setPage] = useState('main');
    const [authError, setAuthError] = useState(null);
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
        if (!code)
            return;
        setExchanging(true);
        exchangeCodeForToken(code)
            .then(({ accessToken, expiresIn }) => {
            setAccessToken(accessToken, expiresIn);
        })
            .catch((err) => {
            setAuthError(err instanceof Error ? err.message : 'Token exchange failed');
        })
            .finally(() => {
            setExchanging(false);
        });
        // OAuth callback runs once on mount — no reactive deps needed.
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Lazy-load the bundled default tracks after first paint so the ~1.5 MB JSON
    // ships as its own chunk instead of blocking the initial shell.
    useEffect(() => {
        if (tracks.length > 0)
            return;
        let cancelled = false;
        loadBundledPlaylists()
            .then((bundled) => {
            if (cancelled)
                return;
            const { tracks: defaultTracks, names } = mergeBundledTracks(bundled, defaultPlaylists);
            if (defaultTracks.length > 0)
                setTracks(defaultTracks, names);
        })
            .catch(() => {
            // Bundled playlist load failed — settings page can still fetch via the API.
        });
        return () => {
            cancelled = true;
        };
    }, [tracks.length, defaultPlaylists, setTracks]);
    if (exchanging) {
        return (_jsxs("div", { style: styles.fullscreen, children: [_jsx("span", { className: "spinner", style: { width: 40, height: 40 } }), _jsx("p", { style: styles.loadingText, children: "Connecting to Spotify\u2026" })] }));
    }
    if (!isAuthenticated) {
        return (_jsx(MainPage, { page: page, setPage: setPage, authError: authError, onClearAuthError: () => setAuthError(null) }));
    }
    if (page === 'settings') {
        return (_jsx(Suspense, { fallback: _jsx("div", { style: styles.fullscreen, children: _jsx("span", { className: "spinner", style: { width: 40, height: 40 } }) }), children: _jsx(SettingsPage, { onBack: () => setPage('main') }) }));
    }
    return (_jsx(MainPage, { page: page, setPage: setPage, authError: authError, onClearAuthError: () => setAuthError(null) }));
}
const styles = {
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
