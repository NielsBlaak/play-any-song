import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clearStoredToken } from '../auth/spotify-pkce';
import { fetchPlaylist } from '../services/spotify';
import { loadBundledPlaylists, useSongStore } from '../store/songStore';
import { colors } from '../theme/colors';
export default function SettingsPage({ onBack }) {
    const { defaultPlaylists, toggleDefaultPlaylist, setTracks, setAccessToken, accessToken, tracks, loadedNames, } = useSongStore();
    const [customUrl, setCustomUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
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
            const results = [];
            for (const p of enabledDefaults) {
                const data = bundled[p.id];
                if (data?.tracks?.length) {
                    results.push(data);
                }
                else if (accessToken) {
                    results.push(await fetchPlaylist(p.url, accessToken));
                }
            }
            if (customUrlTrimmed && accessToken) {
                results.push(await fetchPlaylist(customUrlTrimmed, accessToken));
            }
            const seen = new Set();
            const merged = results
                .flatMap((r) => r.tracks)
                .filter((track) => {
                if (seen.has(track.id))
                    return false;
                seen.add(track.id);
                return true;
            });
            setTracks(merged, results.map((r) => r.name));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
        finally {
            setLoading(false);
        }
    }
    function handleLogout() {
        setAccessToken(null);
        clearStoredToken();
        onBack();
    }
    return (_jsxs("div", { style: s.screen, children: [_jsxs("div", { style: s.header, children: [_jsx("button", { style: s.backBtn, onClick: onBack, children: "\u2190 Back" }), _jsx("h1", { style: s.title, children: "Song Pool" }), _jsx("div", { style: { width: 70 } })] }), _jsxs("div", { style: s.scrollArea, children: [hasLoaded && (_jsxs("div", { style: s.statusBar, children: [_jsxs("p", { style: s.statusText, children: [tracks.length, " songs loaded"] }), loadedNames.length > 0 && (_jsx("p", { style: s.statusSources, children: loadedNames.join('  ·  ') }))] })), _jsx("p", { style: s.sectionTitle, children: "Playlists" }), defaultPlaylists.map((playlist) => (_jsxs("div", { style: { ...s.row, ...(!playlist.enabled ? s.rowDisabled : {}) }, children: [_jsx("span", { style: { ...s.rowName, ...(!playlist.enabled ? s.rowNameMuted : {}) }, children: playlist.name }), _jsxs("label", { className: "toggle", children: [_jsx("input", { type: "checkbox", checked: playlist.enabled, onChange: () => toggleDefaultPlaylist(playlist.id), "aria-label": `Include ${playlist.name} in song pool` }), _jsx("span", { className: "toggle-track" }), _jsx("span", { className: "toggle-thumb" })] })] }, playlist.id))), _jsx("p", { style: { ...s.sectionTitle, marginTop: 20 }, children: "Add Custom Playlist" }), _jsx("input", { style: s.input, type: "url", value: customUrl, onChange: (e) => setCustomUrl(e.target.value), placeholder: "Paste Spotify playlist URL\u2026", autoCapitalize: "none", autoCorrect: "off", spellCheck: false }), error && (_jsx("div", { style: s.errorBox, children: _jsx("p", { style: s.errorText, children: error }) })), _jsx("button", { style: { ...s.loadBtn, ...(loading ? s.disabled : {}) }, onClick: () => { void handleLoad(); }, disabled: loading, children: loading ? (_jsx("span", { className: "spinner spinner--dark" })) : (`${hasLoaded ? 'Reload' : 'Load'} ${totalSources > 1 ? `${totalSources} Playlists` : 'Playlist'}`) }), _jsx("div", { style: { height: 32 } }), _jsx("button", { style: s.logoutBtn, onClick: handleLogout, children: "Log out" }), _jsx("div", { style: { height: 32 } })] })] }));
}
// ── Styles ────────────────────────────────────────────────────────────────────
const s = {
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
