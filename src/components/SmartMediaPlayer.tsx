/**
 * SmartMediaPlayer
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders the right player for any supported media URL:
 *   - YouTube   → responsive 16:9 iframe (youtube.com/embed)
 *   - Vimeo     → responsive 16:9 iframe (player.vimeo.com)
 *   - Spotify   → fixed-height iframe    (open.spotify.com/embed)
 *   - Audiomack → fixed-height iframe    (audiomack.com/embed)
 *   - Native    → full custom HTML5 <video> player with ads support
 *
 * The native player is the same CustomVideoPlayer that already lives in
 * WatchPage.tsx — we accept it as a render-prop so we don't duplicate that
 * ~400-line component.
 */

import React from 'react';

// ─── URL parsing ──────────────────────────────────────────────────────────────

export type MediaType = 'youtube' | 'spotify' | 'vimeo' | 'audiomack' | 'native';

export interface ParsedMedia {
    type: MediaType;
    /** Ready-to-use embed URL (for iframes) or the original URL (for native). */
    embedUrl: string;
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
        // pathname: /123456789  or  /channels/staffpicks/123456789  or  /video/123456789
        const parts = u.pathname.split('/').filter(Boolean);
        // Find the first purely-numeric segment — that's the video ID
        const id = parts.find(p => /^\d+$/.test(p));
        return id || null;
    } catch {
        return null;
    }
}

/**
 * Convert a Spotify share URL into an embed URL.
 * e.g.  open.spotify.com/track/abc123  →  open.spotify.com/embed/track/abc123
 *       open.spotify.com/episode/xyz   →  open.spotify.com/embed/episode/xyz
 */
function convertSpotifyToEmbed(url: string): string | null {
    try {
        const u = new URL(url);
        if (!u.hostname.includes('spotify.com')) return null;
        // pathname starts with /track, /album, /playlist, /episode, /show, …
        const path = u.pathname.replace(/^\//, '');          // "track/abc123"
        if (!path) return null;
        return `https://open.spotify.com/embed/${path}`;
    } catch {
        return null;
    }
}

/**
 * Convert an Audiomack share URL into an embed URL.
 * e.g.  audiomack.com/artist-name/song/song-slug  →  audiomack.com/embed/artist-name/song/song-slug
 */
function convertAudiomackToEmbed(url: string): string | null {
    try {
        const u = new URL(url);
        if (!u.hostname.includes('audiomack.com')) return null;
        // Strip leading slash → "artist/song/slug" or "artist/album/slugs"
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
        return {
            type: 'spotify',
            embedUrl: spotifyEmbed,
            isAudio: true,
        };
    }

    // ── Audiomack ────────────────────────────────────────────────────────────
    const audiomackEmbed = convertAudiomackToEmbed(url);
    if (audiomackEmbed) {
        return {
            type: 'audiomack',
            embedUrl: audiomackEmbed,
            isAudio: true,
        };
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

// ─── Component props ──────────────────────────────────────────────────────────

interface SmartMediaPlayerProps {
    /** The raw video_url value stored in the DB. */
    videoUrl: string;
    /** Render-prop: called when type === 'native'. Receives the resolved URL. */
    renderNative: (url: string) => React.ReactNode;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SmartMediaPlayer({ videoUrl, renderNative }: SmartMediaPlayerProps) {
    const media = parseMediaUrl(videoUrl);

    // Native → delegate entirely to the existing CustomVideoPlayer via render-prop
    if (media.type === 'native') {
        return <>{renderNative(media.embedUrl)}</>;
    }

    const meta = PLATFORM_META[media.type];

    // Audio platforms (Spotify / Audiomack) — fixed-height player, no 16:9 box
    if (media.isAudio) {
        return (
            <div style={{
                width: '100%',
                maxWidth: 1280,
                margin: '0 auto',
                borderRadius: 12,
                overflow: 'hidden',
                background: '#0B0F19',
                border: `1px solid ${meta.color}33`,
                boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${meta.color}22`,
            }}>
                {/* Platform badge */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px 0',
                }}>
                    <span style={{
                        background: meta.color,
                        color: 'white',
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: 20,
                        letterSpacing: '0.5px',
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
                        border: 'none',
                        display: 'block',
                        marginTop: 8,
                    }}
                    title={`${meta.label} player`}
                />
            </div>
        );
    }

    // Video platforms (YouTube / Vimeo) — responsive 16:9 iframe
    return (
        <div style={{
            width: '100%',
            maxWidth: 1280,
            margin: '0 auto',
            borderRadius: 10,
            overflow: 'hidden',
            background: '#000',
            position: 'relative',
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        }}>
            {/* Platform badge — top-left overlay */}
            <div style={{
                position: 'absolute',
                top: 12,
                left: 12,
                zIndex: 5,
                pointerEvents: 'none',
            }}>
                <span style={{
                    background: meta.color,
                    color: 'white',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 20,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
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
                        position: 'absolute',
                        top: 0, left: 0,
                        width: '100%', height: '100%',
                        border: 'none',
                    }}
                    title={`${meta.label} video player`}
                />
            </div>
        </div>
    );
}
