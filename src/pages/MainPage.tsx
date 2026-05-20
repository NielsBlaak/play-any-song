import { useState } from 'react';
import { redirectToSpotifyLogin } from '../auth/spotify-pkce';
import {
  getArtistNames,
  getTrackYear,
  pickRandom,
  playTrack,
  waitForDevice,
  type SpotifyTrack,
} from '../services/spotify';
import { useSongStore } from '../store/songStore';
import { cardColors, colors } from '../theme/colors';
import type { Page } from '../App';

function pickCardColor(): string {
  return cardColors[Math.floor(Math.random() * cardColors.length)] ?? '#7B2FBE';
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  page: Page;
  setPage: (p: Page) => void;
  authError: string | null;
  onClearAuthError: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MainPage({ setPage, authError, onClearAuthError }: Props) {
  const [authLoading, setAuthLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [pendingRetryTrack, setPendingRetryTrack] = useState<SpotifyTrack | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [cardColor, setCardColor] = useState(pickCardColor());

  const {
    tracks,
    accessToken,
    isAuthenticated,
    isPlaying,
    isLoadingPlayback,
    playbackError,
    playedTrackIds,
    setIsPlaying,
    setLoadingPlayback,
    setPlaybackError,
    markTrackPlayed,
    resetPlayedTracks,
  } = useSongStore();

  const remainingTracks = tracks.filter((t) => !playedTrackIds.includes(t.id));
  const allPlayed = tracks.length > 0 && remainingTracks.length === 0;

  // ── Auth ──────────────────────────────────────────────────────────────────

  async function handleLogin() {
    setAuthLoading(true);
    try {
      await redirectToSpotifyLogin();
      // Page will reload after redirect — no further code runs
    } catch {
      setAuthLoading(false);
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  async function startPlayback(track: SpotifyTrack) {
    if (!accessToken) return;
    setPlaybackError(null);
    setPendingRetryTrack(null);
    setLoadingPlayback(true);
    setRevealed(false);
    setCurrentTrack(track);
    setCardColor(pickCardColor());

    const succeed = () => {
      markTrackPlayed(track.id);
      setIsPlaying(true);
      setPlaybackError(null);
      setLoadingPlayback(false);
    };

    try {
      await playTrack(track.uri, accessToken);
      succeed();
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';

      if (!msg.toLowerCase().includes('no active spotify device')) {
        setPlaybackError(msg);
        setCurrentTrack(null);
        setLoadingPlayback(false);
        return;
      }
    }

    // No active device — try to wake Spotify and auto-retry.
    setPlaybackError('Opening Spotify… playback will start in a few seconds.');
    window.open('https://open.spotify.com', '_blank');

    try {
      const device = await waitForDevice(accessToken);
      if (!device) throw new Error('timeout');
      await playTrack(track.uri, accessToken, device.id);
      succeed();
    } catch {
      setPlaybackError(
        'Couldn’t reach Spotify automatically. Open Spotify, start playing anything, then tap Retry.',
      );
      setPendingRetryTrack(track);
      setCurrentTrack(null);
    } finally {
      setLoadingPlayback(false);
    }
  }

  async function handlePlayRandom() {
    const track = pickRandom(remainingTracks);
    if (!track) return;
    await startPlayback(track);
  }

  // ── Login screen ──────────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <div style={s.screen}>
        <div style={s.loginContainer}>
          <h1 style={s.appTitle}>Play Any Song</h1>
          <p style={s.appSubtitle}>Hitster-style card game</p>

          <div style={s.loginCard}>
            <span style={s.loginEmoji}>🎵</span>
            <h2 style={s.loginTitle}>Connect Spotify</h2>
            <p style={s.loginHint}>
              Log in with your Spotify Premium account to start playing.
            </p>

            {authError && (
              <div style={s.errorBox}>
                <p style={s.errorText}>{authError}</p>
                <button
                  style={{ ...s.textBtn, marginTop: 4 }}
                  onClick={onClearAuthError}
                >
                  Dismiss
                </button>
              </div>
            )}

            <button
              style={{ ...s.spotifyBtn, ...(authLoading ? s.disabled : {}) }}
              onClick={() => { void handleLogin(); }}
              disabled={authLoading}
            >
              {authLoading ? (
                <span className="spinner spinner--dark" />
              ) : (
                'Log in with Spotify'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main screen ───────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties =
    revealed && currentTrack
      ? { ...(s.mysteryCard ?? {}), backgroundColor: cardColor, border: 'none' }
      : (s.mysteryCard ?? {});

  return (
    <div style={s.screen}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <h1 style={s.title}>Play Any Song</h1>
          <button
            style={s.settingsBtn}
            onClick={() => setPage('settings')}
            aria-label="Settings"
          >
            ⚙️
          </button>
        </div>

        {/* Mystery / Reveal card */}
        <div style={cardStyle}>
          {revealed && currentTrack ? (
            <div style={s.revealContent}>
              <span style={s.revealArtist}>{getArtistNames(currentTrack)}</span>
              <span style={s.revealYear}>{getTrackYear(currentTrack)}</span>
              <span style={s.revealSong}>{currentTrack.name}</span>
            </div>
          ) : (
            <>
              <span style={s.mysteryEmoji}>🎵</span>
              {isPlaying && (
                <div style={s.playingBadge}>
                  <span style={s.playingDot}>▶</span>
                  <span style={s.playingLabel}>Playing…</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Error */}
        {playbackError && (
          <div style={s.errorBox}>
            <p style={s.errorText}>{playbackError}</p>
            {pendingRetryTrack && (
              <button
                style={{ ...s.retryBtn, ...(isLoadingPlayback ? s.disabled : {}) }}
                onClick={() => { void startPlayback(pendingRetryTrack); }}
                disabled={isLoadingPlayback}
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* No tracks yet */}
        {tracks.length === 0 && (
          <div style={s.hintBox}>
            <p style={s.hintText}>Open ⚙️ settings to load your songs first.</p>
          </div>
        )}

        {/* Controls */}
        {tracks.length > 0 && (
          <div style={s.controls}>
            {allPlayed ? (
              <div style={s.allPlayedBox}>
                <span style={{ fontSize: 48 }}>🎉</span>
                <p style={s.allPlayedText}>All songs played!</p>
                <button style={s.resetBtn} onClick={resetPlayedTracks}>
                  Start New Session
                </button>
              </div>
            ) : !isPlaying ? (
              <button
                style={{ ...s.bigButton, ...(isLoadingPlayback ? s.disabled : {}) }}
                onClick={() => { void handlePlayRandom(); }}
                disabled={isLoadingPlayback}
              >
                {isLoadingPlayback ? (
                  <span className="spinner spinner--dark" style={{ width: 28, height: 28 }} />
                ) : (
                  <>
                    <span style={{ fontSize: 22 }}>🎲</span>
                    Play Random Song
                  </>
                )}
              </button>
            ) : (
              <div style={s.playingControls}>
                {!revealed && (
                  <button style={s.revealButton} onClick={() => setRevealed(true)}>
                    Show Song
                  </button>
                )}
                {revealed && (
                  <button
                    style={{ ...s.bigButton, ...(isLoadingPlayback ? s.disabled : {}) }}
                    onClick={() => { void handlePlayRandom(); }}
                    disabled={isLoadingPlayback}
                  >
                    {isLoadingPlayback ? (
                      <span className="spinner spinner--dark" style={{ width: 28, height: 28 }} />
                    ) : (
                      <>
                        <span style={{ fontSize: 22 }}>🎲</span>
                        Next
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
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

  // ── Login ──
  loginContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
    overflowY: 'auto',
  },
  appTitle: {
    fontSize: 34,
    fontWeight: 800,
    color: colors.pastelLavender,
    textAlign: 'center',
  },
  appSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  loginCard: {
    backgroundColor: colors.card,
    borderRadius: 24,
    border: `1px solid ${colors.border}`,
    padding: 28,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 400,
  },
  loginEmoji: { fontSize: 56 },
  loginTitle: { fontSize: 20, fontWeight: 700, color: colors.textPrimary },
  loginHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 1.6,
  },
  spotifyBtn: {
    backgroundColor: '#1DB954',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    borderRadius: 14,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 32,
    paddingRight: 32,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
    transition: 'opacity 0.15s',
  },
  textBtn: {
    background: 'none',
    color: colors.textSecondary,
    fontSize: 12,
    textDecoration: 'underline',
  },

  // ── Main ──
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  title: { fontSize: 26, fontWeight: 800, color: colors.pastelLavender },
  settingsBtn: {
    backgroundColor: colors.surfaceElevated,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 10,
    fontSize: 20,
    lineHeight: 1,
    transition: 'background 0.15s',
  },

  mysteryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 24,
    border: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    minHeight: 160,
    overflow: 'hidden',
  },
  mysteryEmoji: { fontSize: 72 },
  playingBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.pastelMint + '22',
    border: `1px solid ${colors.pastelMint}88`,
    borderRadius: 20,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 16,
    paddingRight: 16,
  },
  playingDot: { color: colors.pastelMint, fontSize: 12 },
  playingLabel: { color: colors.pastelMint, fontSize: 13, fontWeight: 600 },

  revealContent: {
    flex: 1,
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 28,
    paddingBottom: 28,
    paddingLeft: 20,
    paddingRight: 20,
  },
  revealArtist: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
  },
  revealYear: {
    fontSize: 96,
    fontWeight: 900,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 1,
  },
  revealSong: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.9,
  },

  errorBox: {
    backgroundColor: '#2e1a1a',
    border: `1px solid ${colors.danger}`,
    borderRadius: 12,
    padding: 12,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 1.5 },
  retryBtn: {
    backgroundColor: colors.danger,
    color: '#fff',
    borderRadius: 10,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14,
    fontWeight: 700,
    width: '100%',
  },

  hintBox: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    padding: 16,
    border: `1px solid ${colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hintText: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },

  controls: { display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 },

  bigButton: {
    backgroundColor: colors.primary,
    color: colors.background,
    borderRadius: 20,
    paddingTop: 20,
    paddingBottom: 20,
    fontSize: 18,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    transition: 'opacity 0.15s',
  },

  playingControls: { display: 'flex', flexDirection: 'column', gap: 10 },
  revealButton: {
    backgroundColor: colors.pastelPeach,
    color: colors.background,
    borderRadius: 14,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 24,
    fontWeight: 700,
    width: '100%',
    transition: 'opacity 0.15s',
  },

  allPlayedBox: {
    backgroundColor: colors.card,
    borderRadius: 20,
    border: `1px solid ${colors.border}`,
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  allPlayedText: { color: colors.textPrimary, fontSize: 16, fontWeight: 600 },
  resetBtn: {
    backgroundColor: colors.pastelMint + 'cc',
    color: colors.background,
    borderRadius: 14,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 28,
    paddingRight: 28,
    fontSize: 14,
    fontWeight: 700,
    transition: 'opacity 0.15s',
  },

  disabled: { opacity: 0.5, pointerEvents: 'none' },
};
