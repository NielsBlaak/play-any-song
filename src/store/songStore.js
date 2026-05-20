import { create } from 'zustand';
import { getStoredToken, storeToken, clearStoredToken } from '../auth/spotify-pkce';
/**
 * Dynamic-import the bundled default tracks. Splits the ~1.5 MB JSON into its
 * own chunk so the initial app shell loads fast.
 */
export async function loadBundledPlaylists() {
    const mod = (await import('../data/defaultTracks.json'));
    return mod.default;
}
const DEFAULT_PLAYLISTS = [
    {
        id: 'top2000',
        name: 'Top 2000 - 2025',
        url: 'https://open.spotify.com/playlist/0tyaqq5QcCOt6iOru9Kg51',
        enabled: true,
    },
    {
        id: 'fouteur',
        name: 'Foute uur 1500 - 2025',
        url: 'https://open.spotify.com/playlist/1SutuoTknFbxL9jVsUxbF2',
        enabled: false,
    },
    {
        id: 'accordeon',
        name: 'Lossss accordeon style',
        url: 'https://open.spotify.com/playlist/',
        enabled: false,
    },
    {
        id: 'top100_10s',
        name: 'Top 100 over 2010 - 2019',
        url: 'https://open.spotify.com/playlist/5IRUuYgi6RaNZ1uuvFXrEj',
        enabled: false,
    },
    {
        id: 'top100_20s',
        name: 'Top 100 over 2020 - 2025',
        url: 'https://open.spotify.com/playlist/01sOMQ6iDHtBk1vzQrHC3k',
        enabled: false,
    },
];
export function mergeBundledTracks(bundled, playlists) {
    const seen = new Set();
    const tracks = [];
    const names = [];
    for (const p of playlists) {
        if (!p.enabled)
            continue;
        const data = bundled[p.id];
        if (!data?.tracks?.length)
            continue;
        names.push(data.name);
        for (const t of data.tracks) {
            if (!seen.has(t.id)) {
                seen.add(t.id);
                tracks.push(t);
            }
        }
    }
    return { tracks, names };
}
const storedToken = getStoredToken();
export const useSongStore = create((set) => ({
    tracks: [],
    loadedNames: [],
    isLoadingPlaylist: false,
    playlistError: null,
    defaultPlaylists: DEFAULT_PLAYLISTS,
    accessToken: storedToken,
    isAuthenticated: storedToken !== null,
    isPlaying: false,
    isLoadingPlayback: false,
    playbackError: null,
    playedTrackIds: [],
    setTracks: (tracks, names) => set({ tracks, loadedNames: names }),
    setLoadingPlaylist: (isLoadingPlaylist) => set({ isLoadingPlaylist }),
    setPlaylistError: (playlistError) => set({ playlistError }),
    toggleDefaultPlaylist: (id) => set((state) => ({
        defaultPlaylists: state.defaultPlaylists.map((p) => p.id === id ? { ...p, enabled: !p.enabled } : p),
    })),
    setAccessToken: (accessToken, expiresIn = 3600) => {
        if (accessToken) {
            storeToken(accessToken, expiresIn);
        }
        else {
            clearStoredToken();
        }
        set({ accessToken, isAuthenticated: accessToken !== null });
    },
    setIsPlaying: (isPlaying) => set({ isPlaying }),
    setLoadingPlayback: (isLoadingPlayback) => set({ isLoadingPlayback }),
    setPlaybackError: (playbackError) => set({ playbackError }),
    markTrackPlayed: (id) => set((state) => state.playedTrackIds.includes(id)
        ? state
        : { playedTrackIds: [...state.playedTrackIds, id] }),
    resetPlayedTracks: () => set({ playedTrackIds: [] }),
}));
