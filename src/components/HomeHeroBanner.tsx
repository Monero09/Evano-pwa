import type { Ad } from '../lib/types';
import { useState, useEffect, useCallback } from 'react';

const ROTATE_MS = 7000;

/** True if the URL points to a video file (mp4, webm, mov, ogg) */
function isVideoUrl(url: string): boolean {
    return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}

interface Props {
    /** Already-fetched banner ads from the parent (avoids double fetch) */
    ads: Ad[];
}

/**
 * Renders banner ads INSIDE the .hero shell — same 420px space as the
 * featured video hero. Parent passes `ads`; if empty, this returns null
 * and the parent shows the featured video instead.
 */
export default function HomeHeroBanner({ ads }: Props) {
    const [idx, setIdx] = useState(0);
    const [fading, setFading] = useState(false);

    const crossfadeTo = useCallback((next: number) => {
        setFading(true);
        setTimeout(() => { setIdx(next); setFading(false); }, 280);
    }, []);

    useEffect(() => {
        if (ads.length <= 1) return;
        const id = setInterval(() => {
            setIdx((prev) => {
                const next = (prev + 1) % ads.length;
                setTimeout(() => crossfadeTo(next), 0);
                return prev;
            });
        }, ROTATE_MS);
        return () => clearInterval(id);
    }, [ads.length, crossfadeTo]);

    if (ads.length === 0) return null;

    const ad = ads[idx];

    return (
        <div className="hero">

            {/* ── Full-bleed background: video OR image ── */}
            {isVideoUrl(ad.url) ? (
                <video
                    key={ad.id}
                    src={ad.url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center',
                        opacity: fading ? 0 : 1,
                        transition: 'opacity 0.28s ease',
                        display: 'block',
                    }}
                />
            ) : (
                <img
                    key={ad.id}
                    src={ad.url}
                    alt={ad.title}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center',
                        opacity: fading ? 0 : 1,
                        transition: 'opacity 0.28s ease',
                        display: 'block',
                    }}
                />
            )}

            {/* ── Cinematic gradient overlays ── */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(135deg, rgba(11,15,25,0.65) 0%, transparent 60%)',
                pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: '60%',
                background: 'linear-gradient(to top, rgba(11,15,25,0.85), transparent)',
                pointerEvents: 'none',
            }} />

            {/* ── Content overlay ── */}
            <div className="hero-content">
                <span className="hero-label" style={{ color: '#22C55E' }}>
                    Sponsored Ad
                </span>
                <h2 className="hero-title" style={{ fontSize: 28 }}>
                    {ad.title}
                </h2>

                {/* Dot indicators when multiple slots */}
                {ads.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
                        {ads.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => crossfadeTo(i)}
                                style={{
                                    width: i === idx ? 20 : 7,
                                    height: 7,
                                    borderRadius: 4,
                                    background: i === idx ? '#22C55E' : 'rgba(255,255,255,0.35)',
                                    border: 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: i === idx ? '0 0 8px rgba(34,197,94,0.7)' : 'none',
                                }}
                            />
                        ))}
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 4 }}>
                            {idx + 1}/{ads.length}
                        </span>
                    </div>
                )}
            </div>

            {/* ── Progress bar ── */}
            {ads.length > 1 && (
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 3, background: 'rgba(255,255,255,0.08)',
                }}>
                    <div
                        key={`prog-${idx}`}
                        style={{
                            height: '100%',
                            background: '#22C55E',
                            animation: `heroProg ${ROTATE_MS}ms linear`,
                        }}
                    />
                </div>
            )}

            <style>{`
                @keyframes heroProg {
                    from { width: 0%; }
                    to   { width: 100%; }
                }
            `}</style>
        </div>
    );
}
