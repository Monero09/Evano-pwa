import { useState, useEffect, useCallback } from 'react';
import { getGlobalBannerAds } from '../lib/api';
import type { Ad } from '../lib/types';

const BANNER_HEIGHT = 70;     // px — in sync with CSS var
const ROTATE_MS = 6000;    // ms between auto-swaps

function setCSSVar(open: boolean) {
    document.documentElement.style.setProperty(
        '--ad-banner-h',
        open ? `${BANNER_HEIGHT}px` : '0px'
    );
}

export default function GlobalAdBanner() {
    const [ads, setAds] = useState<Ad[]>([]);
    const [idx, setIdx] = useState(0);
    const [fading, setFading] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    /* ── Load (up to MAX_SLOTS) banner ads ─────────────────────────── */
    useEffect(() => {
        getGlobalBannerAds().then((slots) => {
            if (slots.length > 0) {
                setAds(slots);
                setCSSVar(true);
            }
        });
        return () => setCSSVar(false);
    }, []);

    /* ── Auto-rotate ────────────────────────────────────────────────── */
    useEffect(() => {
        if (ads.length <= 1 || dismissed) return;
        const id = setInterval(() => {
            crossfadeTo((prev) => (prev + 1) % ads.length);
        }, ROTATE_MS);
        return () => clearInterval(id);
    }, [ads.length, dismissed]);

    /* Smooth crossfade: fade out → swap → fade in */
    const crossfadeTo = useCallback((getNext: (prev: number) => number) => {
        setFading(true);
        setTimeout(() => {
            setIdx(getNext);
            setFading(false);
        }, 300);
    }, []);

    const goTo = (i: number) => {
        if (i === idx) return;
        crossfadeTo(() => i);
    };

    const dismiss = () => {
        setDismissed(true);
        setCSSVar(false);
    };

    if (dismissed || ads.length === 0) return null;

    const ad = ads[idx];

    return (
        <div style={{
            position: 'fixed',
            top: 70,
            left: 0,
            right: 0,
            height: BANNER_HEIGHT,
            zIndex: 998,
            background: '#050810',
            overflow: 'hidden',
            boxShadow: '0 3px 20px rgba(0,0,0,0.5)',
            borderBottom: '1px solid rgba(34,197,94,0.12)',
            animation: 'bannerDrop 0.4s cubic-bezier(0.16,1,0.3,1)',
        }}>
            {/* ── Ad image (crossfades) ────────────────────────────── */}
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
                    transition: 'opacity 0.3s ease',
                    display: 'block',
                }}
            />

            {/* ── Dark overlay for readability ─────────────────────── */}
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, transparent 40%, rgba(0,0,0,0.35) 100%)',
                pointerEvents: 'none',
            }} />

            {/* ── "Sponsored" tag ──────────────────────────────────── */}
            <span style={{
                position: 'absolute',
                top: 5,
                left: 10,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: 'rgba(255,255,255,0.45)',
                textTransform: 'uppercase',
                pointerEvents: 'none',
            }}>
                Sponsored
            </span>

            {/* ── Ad title ─────────────────────────────────────────── */}
            <span style={{
                position: 'absolute',
                bottom: 6,
                left: 12,
                fontSize: 11,
                color: 'rgba(255,255,255,0.75)',
                fontWeight: 500,
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
                pointerEvents: 'none',
                maxWidth: 'calc(100% - 120px)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {ad.title}
            </span>

            {/* ── Slot indicator dots (max 4) ───────────────────────── */}
            {ads.length > 1 && (
                <div style={{
                    position: 'absolute',
                    bottom: 8,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                }}>
                    {ads.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => goTo(i)}
                            title={`Slot ${i + 1}`}
                            style={{
                                width: i === idx ? 20 : 6,
                                height: 6,
                                borderRadius: 3,
                                background: i === idx
                                    ? '#22C55E'
                                    : 'rgba(255,255,255,0.35)',
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                transition: 'all 0.35s ease',
                                boxShadow: i === idx ? '0 0 6px #22C55E' : 'none',
                            }}
                        />
                    ))}
                </div>
            )}

            {/* ── Slot number badge (top-right, before close) ──────── */}
            <span style={{
                position: 'absolute',
                top: 6,
                right: 44,
                fontSize: 10,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: '0.05em',
                pointerEvents: 'none',
            }}>
                {idx + 1}/{ads.length}
            </span>

            {/* ── Close button ─────────────────────────────────────── */}
            <button
                onClick={dismiss}
                aria-label="Close banner"
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: 38,
                    background: 'rgba(0,0,0,0.5)',
                    border: 'none',
                    borderLeft: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 18,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.2s, color 0.2s',
                    zIndex: 2,
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.8)';
                    e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(0,0,0,0.5)';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                }}
            >
                ×
            </button>

            {/* ── Progress bar (auto-advance timer) ───────────────── */}
            {ads.length > 1 && (
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    height: 2,
                    background: 'rgba(255,255,255,0.1)',
                    width: '100%',
                }}>
                    <div
                        key={`${idx}-${ads.length}`}   /* reset on each slide */
                        style={{
                            height: '100%',
                            background: '#22C55E',
                            animation: `bannerProgress ${ROTATE_MS}ms linear`,
                            transformOrigin: 'left',
                        }}
                    />
                </div>
            )}

            {/* ── Keyframe animations ──────────────────────────────── */}
            <style>{`
                @keyframes bannerDrop {
                    from { transform: translateY(-100%); opacity: 0; }
                    to   { transform: translateY(0);    opacity: 1; }
                }
                @keyframes bannerProgress {
                    from { width: 0%; }
                    to   { width: 100%; }
                }
            `}</style>
        </div>
    );
}
