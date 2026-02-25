import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchVideos, addToWatchLater, removeFromWatchLater, checkInWatchLater, addToHistory } from './lib/api';
import type { Video } from './lib/types';
import { useAuth } from './components/AuthProvider';

// ==========================================
// CUSTOM VIDEO PLAYER COMPONENT
// ==========================================

type PlayerProps = {
    videoSrc: string;
    poster?: string;
    onViewCounted?: () => void;
};

function CustomVideoPlayer({ videoSrc, poster, onViewCounted }: PlayerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const progressBarRef = useRef<HTMLDivElement | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const hideTimerRef = useRef<number | null>(null);

    // ── 15-second view threshold ───────────────────────────────────────
    // Tracks cumulative seconds of REAL video playback (ads excluded).
    // Uses a ref so it survives re-renders without triggering them.
    const playedSecondsRef = useRef(0);
    const lastTimeRef = useRef<number | null>(null); // last video.currentTime seen
    const viewCountedRef = useRef(false);            // fire callback only once
    const VIEW_THRESHOLD = 15; // seconds


    // ── Auto-hide controls ────────────────────────────────────────────
    // Use a stable ref so event-listener callbacks always see the latest version
    const scheduleHide = useRef<() => void>(() => { });
    scheduleHide.current = () => {
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) {
                setShowControls(false);
            }
        }, 3000);
    };

    const revealControls = () => {
        setShowControls(true);
        scheduleHide.current();
    };

    useEffect(() => {
        const node = containerRef.current;
        const onMove = () => revealControls();
        node?.addEventListener('mousemove', onMove);
        scheduleHide.current();
        return () => {
            node?.removeEventListener('mousemove', onMove);
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    // ── Video native event listeners ──────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => {
            setCurrentTime(video.currentTime);

            // Accumulate real playback seconds for view threshold
            if (!video.paused && !viewCountedRef.current) {
                if (lastTimeRef.current !== null) {
                    const delta = video.currentTime - lastTimeRef.current;
                    if (delta > 0 && delta < 2) {
                        playedSecondsRef.current += delta;
                        if (playedSecondsRef.current >= VIEW_THRESHOLD) {
                            viewCountedRef.current = true;
                            onViewCounted?.();
                        }
                    }
                }
                lastTimeRef.current = video.currentTime;
            } else if (video.paused) {
                lastTimeRef.current = null;
            }
        };
        const onMeta = () => setDuration(isNaN(video.duration) ? 0 : video.duration);
        const onPlay = () => { setIsPlaying(true); scheduleHide.current(); };
        const onPause = () => { setIsPlaying(false); setShowControls(true); };
        video.addEventListener('timeupdate', onTime);
        video.addEventListener('loadedmetadata', onMeta);
        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        return () => {
            video.removeEventListener('timeupdate', onTime);
            video.removeEventListener('loadedmetadata', onMeta);
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
        };
    }, []);

    // ── Play / Pause (explicit button only) ───────────────────────────
    const togglePlay = (e: React.SyntheticEvent) => {
        e.stopPropagation();
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) { video.play(); } else { video.pause(); }
        revealControls();
    };

    // ── Tap handler: 1 tap anywhere outside controls = toggle controls ──
    const handleScreenTap = (e: React.MouseEvent | React.TouchEvent) => {
        // Ignore clicks that land directly on the controls UI
        if ((e.target as HTMLElement).closest('.custom-controls')) return;

        // Simply toggle the controls on/off
        setShowControls(prev => {
            const next = !prev;
            if (next) scheduleHide.current();
            return next;
        });
    };

    // ── Progress bar: mouse click ─────────────────────────────────────
    const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const video = videoRef.current;
        const bar = progressBarRef.current;
        if (!video || !bar) return;
        const { left, width } = bar.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - left) / width));
        video.currentTime = pos * (video.duration || 0);
    };

    // ── Progress bar: touch drag ──────────────────────────────────────
    const handleProgressTouch = (e: React.TouchEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const video = videoRef.current;
        const bar = progressBarRef.current;
        if (!video || !bar || !e.touches[0]) return;
        const { left, width } = bar.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.touches[0].clientX - left) / width));
        video.currentTime = pos * (video.duration || 0);
    };

    // ── Fullscreen + landscape lock ───────────────────────────────────
    const toggleFullscreen = async () => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        const isFs = !!(
            document.fullscreenElement ||
            (document as any).webkitFullscreenElement
        );

        try {
            if (!isFs) {
                // Always enter fullscreen on the CONTAINER so custom controls are inside
                if (container.requestFullscreen) {
                    await container.requestFullscreen();
                } else if ((container as any).webkitRequestFullscreen) {
                    (container as any).webkitRequestFullscreen();
                } else if ((video as any).webkitEnterFullscreen) {
                    // iOS Safari last resort
                    (video as any).webkitEnterFullscreen();
                }
                // Force landscape on Chrome Android / Firefox Android
                if (window.screen && screen.orientation && (screen.orientation as any).lock) {
                    await (screen.orientation as any).lock('landscape').catch(() => { });
                }
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if ((document as any).webkitExitFullscreen) {
                    (document as any).webkitExitFullscreen();
                }
                // Release orientation lock
                if (window.screen && screen.orientation && (screen.orientation as any).unlock) {
                    (screen.orientation as any).unlock();
                }
            }
        } catch (err) {
            console.error('Fullscreen error:', err);
        }
    };

    // ── Helpers ───────────────────────────────────────────────────────
    const fmt = (s: number) => {
        const m = Math.floor(s / 60);
        return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    };
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

    // ── Render ────────────────────────────────────────────────────────
    return (
        <div
            ref={containerRef}
            className="custom-player-container"
            onClick={handleScreenTap}
            style={{
                position: 'relative',
                width: '100%',
                maxWidth: '1280px',
                margin: '0 auto',
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: '#000',
                cursor: 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                // Stay BELOW the navbar (z-index: 1000) so the sidebar is always clickable
                zIndex: 10,
            } as React.CSSProperties}
        >
            {/* 16:9 wrapper */}
            <div style={{ position: 'relative', paddingTop: '56.25%', backgroundColor: '#000' }}>

                {/* ── <video> — pointer-events:none, container handles all input ── */}
                <video
                    ref={videoRef}
                    src={videoSrc}
                    poster={poster}
                    playsInline
                    style={{
                        position: 'absolute', top: 0, left: 0,
                        width: '100%', height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                    }}
                />



                {/* ═══════════════════════════════════════════════════════════
                    CONTROLS OVERLAY
                    z-index: 2147483647 = INT_MAX → Chrome Android fullscreen
                    will NEVER push our controls behind the video layer.
                    pointerEvents toggles so background tap-to-toggle still works.
                ═══════════════════════════════════════════════════════════ */}
                <div
                    className={`custom-controls ${showControls ? 'visible' : 'hidden'}`}
                    onClick={e => e.stopPropagation()}
                    style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', flexDirection: 'column',
                        justifyContent: 'flex-end',
                        opacity: showControls ? 1 : 0,
                        transition: 'opacity 0.25s ease',
                        // In fullscreen: use INT_MAX so Chrome Android never hides controls behind video.
                        // Outside fullscreen: use 10 to stay below the navbar (z-index 1000).
                        zIndex: document.fullscreenElement ? 2147483647 : 10,
                        pointerEvents: showControls ? 'auto' : 'none',
                    }}
                >
                    {/* ── Centre controls: rewind / play / fast-forward ── */}
                    <div
                        className="center-controls"
                        onClick={e => e.stopPropagation()}
                        onTouchEnd={e => e.stopPropagation()}
                    >
                        {/* -10s rewind */}
                        <button
                            className="seek-btn"
                            onPointerDown={e => {
                                e.stopPropagation();
                                if (videoRef.current) videoRef.current.currentTime -= 10;
                            }}
                            aria-label="Rewind 10 seconds"
                        >
                            <span style={{ fontSize: 11, display: 'block', lineHeight: 1 }}>-10s</span>
                            <span style={{ fontSize: 20 }}>↺</span>
                        </button>

                        {/* Play / Pause */}
                        <button
                            className="seek-btn"
                            onPointerDown={e => togglePlay(e)}
                            style={{ width: 68, height: 68, fontSize: 28 }}
                            aria-label={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isPlaying ? '❚❚' : '▶'}
                        </button>

                        {/* +10s fast-forward */}
                        <button
                            className="seek-btn"
                            onPointerDown={e => {
                                e.stopPropagation();
                                if (videoRef.current) videoRef.current.currentTime += 10;
                            }}
                            aria-label="Fast-forward 10 seconds"
                        >
                            <span style={{ fontSize: 11, display: 'block', lineHeight: 1 }}>+10s</span>
                            <span style={{ fontSize: 20 }}>↻</span>
                        </button>
                    </div>

                    {/* Bottom gradient bar */}
                    <div style={{
                        background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.88))',
                        padding: '10px 14px 12px',
                        display: 'flex', flexDirection: 'column', gap: 8,
                    }}>

                        {/* ── Progress bar with large touch target ── */}
                        <div
                            ref={progressBarRef}
                            onClick={handleSeekClick}
                            onTouchStart={handleProgressTouch}
                            onTouchMove={handleProgressTouch}
                            style={{
                                width: '100%', height: 20, // tall touch target
                                display: 'flex', alignItems: 'center',
                                cursor: 'pointer',
                            }}
                        >
                            <div style={{
                                position: 'relative',
                                width: '100%', height: 5,
                                background: 'rgba(255,255,255,0.28)',
                                borderRadius: 3,
                            }}>
                                {/* Filled portion */}
                                <div style={{
                                    width: `${pct}%`, height: '100%',
                                    background: 'linear-gradient(90deg, #22C55E, #16A34A)',
                                    borderRadius: 3,
                                    transition: 'width 0.1s linear',
                                }} />
                                {/* Scrubber thumb — larger for fat fingers */}
                                <div style={{
                                    position: 'absolute', top: '50%',
                                    left: `${pct}%`,
                                    transform: 'translate(-50%, -50%)',
                                    width: 14, height: 14,
                                    borderRadius: '50%',
                                    background: '#fff',
                                    boxShadow: '0 0 5px rgba(0,0,0,0.55)',
                                }} />
                            </div>
                        </div>

                        {/* ── Bottom button row ── */}
                        <div style={{
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {/* Play/Pause (bottom bar duplicate) */}
                                <button
                                    onPointerDown={e => togglePlay(e)}
                                    aria-label={isPlaying ? 'Pause' : 'Play'}
                                    style={{
                                        background: 'transparent', border: 'none',
                                        color: 'white', fontSize: 22,
                                        cursor: 'pointer', padding: 0,
                                        minWidth: 40, minHeight: 40,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    {isPlaying ? '❚❚' : '▶'}
                                </button>

                                {/* Timestamp */}
                                <span style={{
                                    color: 'white', fontSize: 13,
                                    fontFamily: 'monospace', whiteSpace: 'nowrap',
                                    userSelect: 'none',
                                }}>
                                    {fmt(currentTime)} / {fmt(duration)}
                                </span>
                            </div>

                            {/* Fullscreen */}
                            <button
                                onPointerDown={e => { e.stopPropagation(); toggleFullscreen(); }}
                                aria-label="Toggle fullscreen"
                                style={{
                                    background: 'transparent', border: 'none',
                                    color: 'white', fontSize: 20,
                                    cursor: 'pointer', padding: 0,
                                    minWidth: 40, minHeight: 40,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >
                                ⛶
                            </button>
                        </div>
                    </div>
                </div>
            </div>{/* end 16:9 wrapper */}

            <style>{`
                @keyframes seekFade {
                    0%   { opacity: 1;   transform: translate(-50%, -50%) scale(1);    }
                    100% { opacity: 0;   transform: translate(-50%, -60%) scale(1.1);  }
                }
                @keyframes slideInLeft {
                    0%   { transform: translateX(-110%); opacity: 0; }
                    100% { transform: translateX(0);     opacity: 1; }
                }
                /* Fullscreen: fill the entire screen with the container */
                .custom-player-container:fullscreen,
                .custom-player-container:-webkit-full-screen {
                    width: 100vw !important;
                    height: 100vh !important;
                    max-width: none !important;
                    border-radius: 0 !important;
                }
                .custom-player-container:fullscreen > div:first-child,
                .custom-player-container:-webkit-full-screen > div:first-child {
                    padding-top: 0 !important;
                    height: 100vh !important;
                }
                @media (max-width: 768px) {
                    .custom-controls { padding: 0 !important; }
                }

                /* ── Center controls row ── */
                .center-controls {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    display: flex;
                    align-items: center;
                    gap: 40px;
                    z-index: 2;
                }

                /* ── Seek / play buttons ── */
                .seek-btn {
                    width: 56px;
                    height: 56px;
                    border-radius: 50%;
                    background: rgba(0, 0, 0, 0.55);
                    border: 2px solid rgba(255, 255, 255, 0.35);
                    color: white;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 1px;
                    cursor: pointer;
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    transition: background 0.15s, transform 0.1s;
                    -webkit-tap-highlight-color: transparent;
                }
                .seek-btn:hover {
                    background: rgba(34, 197, 94, 0.15);
                    border-color: rgba(34, 197, 94, 0.1);
                }
                .seek-btn:active {
                    transform: scale(0.92);
                    background: rgba(34, 197, 94, 0.65);
                }
            `}</style>
        </div>
    );
}

// ==========================================
// WATCH PAGE COMPONENT
// ==========================================

export default function WatchPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);
    const [inMyList, setInMyList] = useState(false);

    useEffect(() => {
        fetchVideos().then(data => {
            setVideos(data);
            setLoading(false);
        });
    }, []);

    const video = videos.find(v => v.id === id);

    // Effect for Views, History, and Ads
    useEffect(() => {
        if (!video) return;

        // Views are counted in CustomVideoPlayer after 15 s of real playback
        // via the onViewCounted callback — see below.

        // 1. History & Check List (if logged in)
        if (user) {
            addToHistory(user.id, video.id);
            checkInWatchLater(user.id, video.id).then(setInMyList);
        }
    }, [video, user]);

    if (loading) return <div style={{ color: 'white', padding: 20 }}>Loading...</div>;

    if (!video) {
        return <div style={{ color: 'white', padding: 20 }}>Video not found.</div>;
    }

    const recommended = videos.filter(v => v.id !== video.id).slice(0, 8);

    const toggleMyList = async () => {
        if (!user) {
            navigate('/login');
            return;
        }
        try {
            if (inMyList) {
                await removeFromWatchLater(user.id, video.id);
                setInMyList(false);
            } else {
                await addToWatchLater(user.id, video.id);
                setInMyList(true);
            }
        } catch (e) {
            console.error('List toggle failed', e);
        }
    };

    return (
        <>
            <main className="watch-root">
                {/* Video Player Section */}
                <section className="watch-hero">
                    <CustomVideoPlayer
                        videoSrc={video.video_url}
                        poster={video.thumbnail_url}
                        onViewCounted={() => {
                            import('./lib/api').then(mod => mod.incrementView(video.id));
                        }}
                    />
                </section>

                {/* Video Metadata */}
                <section className="watch-meta">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                            <h1 className="watch-title">{video.title}</h1>
                            <div className="watch-sub" style={{ marginBottom: 12 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                    <span>{video.category}</span>
                                    <span>•</span>
                                    <span>{new Date(video.created_at).toLocaleDateString()}</span>
                                    <span>•</span>
                                    <span>{video.view_count || 0} views</span>
                                </span>
                            </div>
                        </div>
                        <button
                            onClick={toggleMyList}
                            style={{
                                background: inMyList ? 'var(--primary-gradient)' : 'rgba(255,255,255,0.1)',
                                border: 'none',
                                borderRadius: '50%',
                                width: 48,
                                height: 48,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                marginTop: 0,
                                transition: 'all 0.2s ease',
                                color: 'white',
                                boxShadow: inMyList ? '0 4px 16px rgba(34, 197, 94, 0.3)' : 'none',
                                flexShrink: 0
                            }}
                            title={inMyList ? 'Remove from My List' : 'Add to My List'}
                        >
                            {inMyList ? (
                                <svg viewBox="0 0 24 24" width="24" height="24"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            ) : (
                                <svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            )}
                        </button>
                    </div>
                    <p className="watch-desc">{video.description}</p>
                </section>

                {/* Recommended Videos */}
                <aside className="watch-recs">
                    <h3 className="recs-header" style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Recommended For You</h3>
                    <div className="recs-grid">
                        {recommended.map((r) => (
                            <div key={r.id} className="rec-card" role="button" tabIndex={0} onClick={() => navigate(`/watch/${r.id}`)} style={{ cursor: 'pointer' }}>
                                <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 6, overflow: 'hidden' }}>
                                    <img src={r.thumbnail_url} alt={r.title} className="rec-thumb" />
                                    <div style={{
                                        position: 'absolute',
                                        inset: 0,
                                        background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.8))',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'flex-end',
                                        padding: 8,
                                        opacity: 0,
                                        transition: 'opacity 0.2s ease'
                                    }} onMouseEnter={e => (e.currentTarget.style.opacity = '1')} onMouseLeave={e => (e.currentTarget.style.opacity = '0')}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: 'white' }}>{r.title}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>
            </main>
        </>
    );
}