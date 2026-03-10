/**
 * SmartMediaPlayer
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the right player for any supported media URL:
 *   - YouTube   → react-youtube <YouTube /> with custom Evano end-screen overlay
 *   - Vimeo     → responsive 16:9 iframe (player.vimeo.com)
 *   - Spotify   → fixed-height iframe    (open.spotify.com/embed)
 *   - Audiomack → fixed-height iframe    (audiomack.com/embed)
 *   - Native    → full custom HTML5 <video> player with ads support (via render-prop)
 */

import React, { useState, useRef, useEffect } from 'react';
import YouTube from 'react-youtube';
import type { Video } from '../lib/types';
import { useNavigate } from 'react-router-dom';

// ─── URL parsing ──────────────────────────────────────────────────────────────

export type MediaType = 'youtube' | 'spotify' | 'vimeo' | 'audiomack' | 'native';

export interface ParsedMedia {
    type: MediaType;
    /** Ready-to-use embed URL (for iframes) or the original URL (for native). */
    embedUrl: string;
    /** YouTube video ID — only set when type === 'youtube'. */
    youtubeId?: string;
    /** Whether this media is audio-only (affects aspect-ratio rendering). */
    isAudio: boolean;
}

/** Extract a YouTube video ID from all common URL shapes. */
function extractYouTubeId(url: string): string | null {
    try {
        const u = new URL(url);
        if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null;
        if (u.hostname.includes('youtube.com')) {
            const v = u.searchParams.get('v');
            if (v) return v;
            // /embed/<id>, /shorts/<id>, /v/<id>
            const parts = u.pathname.split('/').filter(Boolean);
            if (['embed', 'shorts', 'v'].includes(parts[0]) && parts[1]) return parts[1];
        }
        return null;
    } catch {
        return null;
    }
}

/** Extract a Vimeo video ID (numeric) from standard Vimeo URLs. */
function extractVimeoId(url: string): string | null {
    try {
        const u = new URL(url);
        if (!u.hostname.includes('vimeo.com')) return null;
        const parts = u.pathname.split('/').filter(Boolean);
        const id = parts.find(p => /^\d+$/.test(p));
        return id || null;
    } catch {
        return null;
    }
}

function convertSpotifyToEmbed(url: string): string | null {
    try {
        const u = new URL(url);
        if (!u.hostname.includes('spotify.com')) return null;
        const path = u.pathname.replace(/^\//, '');
        if (!path) return null;
        return `https://open.spotify.com/embed/${path}`;
    } catch {
        return null;
    }
}

function convertAudiomackToEmbed(url: string): string | null {
    try {
        const u = new URL(url);
        if (!u.hostname.includes('audiomack.com')) return null;
        const path = u.pathname.replace(/^\//, '');
        if (!path) return null;
        return `https://audiomack.com/embed/${path}`;
    } catch {
        return null;
    }
}

/** Parse any video_url from the DB into a typed, embed-ready result. */
export function parseMediaUrl(url: string): ParsedMedia {
    if (!url) return { type: 'native', embedUrl: url, isAudio: false };

    // ── YouTube ──────────────────────────────────────────────────────────────
    const ytId = extractYouTubeId(url);
    if (ytId) {
        return {
            type: 'youtube',
            embedUrl: `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1`,
            youtubeId: ytId,
            isAudio: false,
        };
    }

    // ── Vimeo ────────────────────────────────────────────────────────────────
    const vimeoId = extractVimeoId(url);
    if (vimeoId) {
        return {
            type: 'vimeo',
            embedUrl: `https://player.vimeo.com/video/${vimeoId}?badge=0&byline=0&portrait=0&title=0`,
            isAudio: false,
        };
    }

    // ── Spotify ──────────────────────────────────────────────────────────────
    const spotifyEmbed = convertSpotifyToEmbed(url);
    if (spotifyEmbed) {
        return { type: 'spotify', embedUrl: spotifyEmbed, isAudio: true };
    }

    // ── Audiomack ────────────────────────────────────────────────────────────
    const audiomackEmbed = convertAudiomackToEmbed(url);
    if (audiomackEmbed) {
        return { type: 'audiomack', embedUrl: audiomackEmbed, isAudio: true };
    }

    // ── Native (Cloudflare R2 or any direct video URL) ────────────────────────
    return { type: 'native', embedUrl: url, isAudio: false };
}

// ─── Platform badge helpers ───────────────────────────────────────────────────

const PLATFORM_META: Record<Exclude<MediaType, 'native'>, { label: string; color: string; icon: string }> = {
    youtube: { label: 'YouTube', color: '#FF0000', icon: '▶' },
    vimeo: { label: 'Vimeo', color: '#1AB7EA', icon: '▶' },
    spotify: { label: 'Spotify', color: '#1DB954', icon: '♫' },
    audiomack: { label: 'Audiomack', color: '#FFA500', icon: '♫' },
};

// ─── YouTube player with Evano end-screen overlay ─────────────────────────────

interface YouTubePlayerProps {
    videoId: string;
    recommendedVideos: Video[];
}

function YouTubePlayer({ videoId, recommendedVideos }: YouTubePlayerProps) {
    const navigate = useNavigate();
    const playerRef = useRef<any>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [showEvanoOverlay, setShowEvanoOverlay] = useState(false);

    // Clear the polling interval — called on pause, end, unmount
    const clearTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    };

    // Cleanup on unmount
    useEffect(() => () => clearTimer(), []);

    // react-youtube opts
    const opts = {
        width: '100%',
        height: '100%',
        playerVars: {
            autoplay: 1 as const,
            rel: 0 as const,
            modestbranding: 1 as const,
            playsinline: 1 as const,
        },
    };

    const handleReady = (e: { target: any }) => {
        playerRef.current = e.target;
    };

    const handlePlay = () => {
        clearTimer(); // clear any stale timer first
        setShowEvanoOverlay(false);

        timerRef.current = setInterval(() => {
            const player = playerRef.current;
            if (!player) return;
            try {
                const current = player.getCurrentTime() as number;
                const total = player.getDuration() as number;
                // Trigger overlay 3 seconds before the end
                if (total > 0 && current >= total - 3) {
                    clearTimer();
                    player.pauseVideo();
                    setShowEvanoOverlay(true);
                }
            } catch {
                clearTimer();
            }
        }, 500);
    };

    const handlePause = () => clearTimer();
    const handleEnd = () => {
        clearTimer();
        setShowEvanoOverlay(true);
    };

    const handleReplay = () => {
        const player = playerRef.current;
        if (!player) return;
        player.seekTo(0);
        player.playVideo();
        setShowEvanoOverlay(false);
    };

    // Limit overlay recommendations to 3
    const overlayRecs = recommendedVideos.slice(0, 3);

    return (
        <div style={{ position: 'relative', width: '100%', maxWidth: 1280, margin: '0 auto' }}>

            {/* ── 16:9 YouTube player wrapper ── */}
            <div style={{
                position: 'relative',
                paddingTop: '56.25%',
                background: '#000',
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            }}>
                {/* YouTube badge */}
                <div style={{
                    position: 'absolute', top: 12, left: 12, zIndex: 5, pointerEvents: 'none',
                }}>
                    <span style={{
                        background: '#FF0000', color: 'white', fontSize: 11,
                        fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                        letterSpacing: '0.5px', textTransform: 'uppercase',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    }}>
                        ▶ YouTube
                    </span>
                </div>

                {/* react-youtube component */}
                <YouTube
                    videoId={videoId}
                    opts={opts}
                    onReady={handleReady}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onEnd={handleEnd}
                    style={{
                        position: 'absolute', top: 0, left: 0,
                        width: '100%', height: '100%',
                    }}
                    iframeClassName="yt-iframe-fill"
                />

                {/* ── Evano End-Screen Overlay ── */}
                {showEvanoOverlay && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 50,
                        background: 'rgba(0, 0, 0, 0.92)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        padding: '24px 20px',
                        color: 'white',
                        animation: 'evanoOverlayFadeIn 0.35s ease',
                    }}>

                        {/* Logo / brand mark */}
                        <div style={{
                            width: 52, height: 52, marginBottom: 14,
                            background: 'linear-gradient(135deg, #14532d, #22C55E)',
                            borderRadius: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, fontWeight: 900, letterSpacing: '-1px',
                            boxShadow: '0 4px 20px rgba(34,197,94,0.4)',
                        }}>
                            E
                        </div>

                        <h2 style={{
                            fontSize: 'clamp(16px, 3vw, 22px)', fontWeight: 800,
                            margin: '0 0 4px',
                            background: 'linear-gradient(90deg, #fff 30%, #22C55E)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}>
                            Up Next on Evano Streams
                        </h2>
                        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
                            Continue watching something great
                        </p>

                        {/* Recommended thumbnails grid */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: 12,
                            width: '100%',
                            maxWidth: 560,
                            marginBottom: 24,
                        }}>
                            {overlayRecs.length > 0
                                ? overlayRecs.map(r => (
                                    <div
                                        key={r.id}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => navigate(`/watch/${r.id}`)}
                                        onKeyDown={e => e.key === 'Enter' && navigate(`/watch/${r.id}`)}
                                        style={{
                                            cursor: 'pointer',
                                            borderRadius: 10,
                                            overflow: 'hidden',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            transition: 'transform 0.18s ease, box-shadow 0.18s ease',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLElement).style.transform = 'scale(1.04)';
                                            (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(34,197,94,0.25)';
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                                            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                                        }}
                                    >
                                        {/* Thumbnail */}
                                        <div style={{ position: 'relative', paddingTop: '56.25%', background: '#1A1F2E' }}>
                                            <img
                                                src={r.thumbnail_url}
                                                alt={r.title}
                                                style={{
                                                    position: 'absolute', inset: 0,
                                                    width: '100%', height: '100%',
                                                    objectFit: 'cover',
                                                }}
                                            />
                                            {/* Play icon overlay */}
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                background: 'rgba(0,0,0,0)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                transition: 'background 0.2s',
                                            }} />
                                        </div>
                                        {/* Title */}
                                        <div style={{
                                            padding: '7px 8px',
                                            background: '#111418',
                                            fontSize: 11, fontWeight: 600,
                                            color: '#d1d5db',
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        }}>
                                            {r.title}
                                        </div>
                                    </div>
                                ))
                                // Skeleton placeholders when no recs are available
                                : [0, 1, 2].map(i => (
                                    <div key={i} style={{
                                        borderRadius: 10, overflow: 'hidden',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}>
                                        <div style={{
                                            paddingTop: '56.25%',
                                            background: 'linear-gradient(135deg, #1a1f2e, #232838)',
                                            position: 'relative',
                                        }}>
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#374151', fontSize: 20,
                                            }}>
                                                ▶
                                            </div>
                                        </div>
                                        <div style={{
                                            height: 28, background: '#111418',
                                            borderTop: '1px solid rgba(255,255,255,0.05)',
                                        }} />
                                    </div>
                                ))
                            }
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button
                                onClick={handleReplay}
                                style={{
                                    padding: '10px 22px',
                                    borderRadius: 8,
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    background: 'rgba(255,255,255,0.08)',
                                    color: 'white',
                                    fontSize: 13, fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    backdropFilter: 'blur(4px)',
                                    display: 'flex', alignItems: 'center', gap: 7,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                            >
                                ↺ Replay Video
                            </button>

                            <button
                                onClick={() => navigate('/')}
                                style={{
                                    padding: '10px 22px',
                                    borderRadius: 8,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #14532d, #22C55E)',
                                    color: 'white',
                                    fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'opacity 0.2s',
                                    display: 'flex', alignItems: 'center', gap: 7,
                                    boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                            >
                                🏠 Browse More
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Keyframes — scoped to this player */}
            <style>{`
                .yt-iframe-fill { width: 100% !important; height: 100% !important; }
                @keyframes evanoOverlayFadeIn {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
            `}</style>
        </div>
    );
}

// ─── Main SmartMediaPlayer component ─────────────────────────────────────────

interface SmartMediaPlayerProps {
    /** The raw video_url value stored in the DB. */
    videoUrl: string;
    /** Videos to show in the YouTube end-screen overlay. */
    recommendedVideos?: Video[];
    /** Render-prop: called when type === 'native'. Receives the resolved URL. */
    renderNative: (url: string) => React.ReactNode;
}

export default function SmartMediaPlayer({ videoUrl, recommendedVideos = [], renderNative }: SmartMediaPlayerProps) {
    const media = parseMediaUrl(videoUrl);

    // ── Native → delegate to CustomVideoPlayer via render-prop ───────────────
    if (media.type === 'native') {
        return <>{renderNative(media.embedUrl)}</>;
    }

    // ── YouTube → react-youtube with Evano end-screen ────────────────────────
    if (media.type === 'youtube' && media.youtubeId) {
        return (
            <YouTubePlayer
                videoId={media.youtubeId}
                recommendedVideos={recommendedVideos}
            />
        );
    }

    const meta = PLATFORM_META[media.type];

    // ── Audio platforms (Spotify / Audiomack) — fixed-height player ──────────
    if (media.isAudio) {
        return (
            <div style={{
                width: '100%', maxWidth: 1280, margin: '0 auto',
                borderRadius: 12, overflow: 'hidden', background: '#0B0F19',
                border: `1px solid ${meta.color}33`,
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${meta.color}22`,
            }}>
                {/* Platform badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 0' }}>
                    <span style={{
                        background: meta.color, color: 'white', fontSize: 11, fontWeight: 700,
                        padding: '3px 10px', borderRadius: 20, letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                    }}>
                        {meta.icon} {meta.label}
                    </span>
                </div>

                {/* Embed iframe */}
                <iframe
                    src={media.embedUrl}
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                    style={{
                        width: '100%',
                        height: media.type === 'spotify' ? 352 : 200,
                        border: 'none', display: 'block', marginTop: 8,
                    }}
                    title={`${meta.label} player`}
                />
            </div>
        );
    }

    // ── Vimeo — responsive 16:9 iframe ───────────────────────────────────────
    return (
        <div style={{
            width: '100%', maxWidth: 1280, margin: '0 auto',
            borderRadius: 10, overflow: 'hidden', background: '#000',
            position: 'relative', boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        }}>
            {/* Platform badge */}
            <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, pointerEvents: 'none' }}>
                <span style={{
                    background: meta.color, color: 'white', fontSize: 11, fontWeight: 700,
                    padding: '4px 10px', borderRadius: 20, letterSpacing: '0.5px',
                    textTransform: 'uppercase', boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}>
                    {meta.icon} {meta.label}
                </span>
            </div>

            {/* Responsive 16:9 wrapper */}
            <div style={{ position: 'relative', paddingTop: '56.25%' }}>
                <iframe
                    src={media.embedUrl}
                    allow="autoplay; fullscreen; picture-in-picture; clipboard-write"
                    allowFullScreen
                    loading="lazy"
                    style={{
                        position: 'absolute', top: 0, left: 0,
                        width: '100%', height: '100%', border: 'none',
                    }}
                    title={`${meta.label} video player`}
                />
            </div>
        </div>
    );
}
