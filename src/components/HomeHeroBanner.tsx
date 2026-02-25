import { useState, useEffect, useCallback } from 'react';
import { getGlobalBannerAds } from '../lib/api';
import type { Ad } from '../lib/types';

const ROTATE_MS = 7000; // ms before auto-advancing to next slot

export default function HomeHeroBanner() {
    const [ads, setAds] = useState<Ad[]>([]);
    const [idx, setIdx] = useState(0);
    const [fading, setFading] = useState(false);

    // Load admin-assigned banner slots once on mount
    useEffect(() => {
        getGlobalBannerAds().then((slots) => {
            setAds(slots);
        });
    }, []);

    // Crossfade helper
    const crossfadeTo = useCallback((next: number) => {
        setFading(true);
        setTimeout(() => { setIdx(next); setFading(false); }, 280);
    }, []);

    // Auto-rotate through slots
    useEffect(() => {
        if (ads.length <= 1) return;
        const id = setInterval(() => {
            setIdx((prev) => {
                const next = (prev + 1) % ads.length;
                crossfadeTo(next);
                return prev; // crossfadeTo handles the actual idx update
            });
        }, ROTATE_MS);
        return () => clearInterval(id);
    }, [ads.length, crossfadeTo]);

    // Collapse if no slots assigned
    if (ads.length === 0) return null;

    const ad = ads[idx];

    return (
        <div style={{
            /* ── In document flow — NOT fixed/sticky ── */
            position: 'relative',
            width: '100%',
            maxHeight: 220,
            minHeight: 100,
            overflow: 'hidden',
            borderRadius: 16,
            marginBottom: 28,
            boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
            cursor: 'default',
            background: '#0B0F19',
        }}>
            {/* ── Ad image (crossfades on swap) ── */}
            <img
                key={ad.id}
                src={ad.url}
                alt={ad.title}
                style={{
                    width: '100%',
                    height: '100%',
                    maxHeight: 220,
                    objectFit: 'cover',
                    objectPosition: 'center',
                    display: 'block',
                    opacity: fading ? 0 : 1,
                    transition: 'opacity 0.28s ease',
                }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />

            {/* ── Gradient overlays for text legibility ── */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, rgba(11,15,25,0.55) 0%, transparent 50%, rgba(11,15,25,0.3) 100%)',
                pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: '50%',
                background: 'linear-gradient(to top, rgba(11,15,25,0.7), transparent)',
                pointerEvents: 'none',
            }} />

            {/* ── "Ad" badge — top left ── */}
            <span style={{
                position: 'absolute',
                top: 10,
                left: 12,
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.18)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: 4,
                pointerEvents: 'none',
            }}>
                Sponsored
            </span>

            {/* ── Ad title — bottom left ── */}
            <span style={{
                position: 'absolute',
                bottom: ads.length > 1 ? 26 : 10,
                left: 14,
                fontSize: 12,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.85)',
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                pointerEvents: 'none',
                maxWidth: 'calc(100% - 60px)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {ad.title}
            </span>

            {/* ── Dot indicators + progress bar (only if multiple slots) ── */}
            {ads.length > 1 && (
                <>
                    {/* Dot row */}
                    <div style={{
                        position: 'absolute',
                        bottom: 8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: 5,
                        alignItems: 'center',
                    }}>
                        {ads.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => crossfadeTo(i)}
                                style={{
                                    width: i === idx ? 18 : 6,
                                    height: 6,
                                    borderRadius: 3,
                                    background: i === idx ? '#22C55E' : 'rgba(255,255,255,0.4)',
                                    border: 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: i === idx ? '0 0 6px rgba(34,197,94,0.7)' : 'none',
                                }}
                            />
                        ))}
                    </div>

                    {/* Thin progress bar at very bottom */}
                    <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        height: 2, background: 'rgba(255,255,255,0.08)',
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
                </>
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
