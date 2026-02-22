import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchVideos, addToWatchLater, removeFromWatchLater, checkInWatchLater, addToHistory, getAdById } from './lib/api';
import type { Video } from './lib/types';
import { useAuth } from './components/AuthProvider';

// ==========================================
// CUSTOM VIDEO PLAYER COMPONENT
// ==========================================

type PlayerProps = {
    videoSrc: string;
    poster?: string;
    preRollAdSrc?: string | null;
    bannerAdSrc?: string | null;
};

function CustomVideoPlayer({ videoSrc, poster, preRollAdSrc, bannerAdSrc }: PlayerProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const progressBarRef = useRef<HTMLDivElement | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [showBannerAd, setShowBannerAd] = useState(false);

    // Ad state
    const [currentSrc, setCurrentSrc] = useState(preRollAdSrc || videoSrc);
    const [isShowingAd, setIsShowingAd] = useState(!!preRollAdSrc);

    // Double-tap seek flash: '+10s' | '-10s' | null
    const [seekFlash, setSeekFlash] = useState<string | null>(null);

    const hideTimerRef = useRef<number | null>(null);
    const tapTimerRef = useRef<number | null>(null);
    const lastTapRef = useRef<number>(0);

    // ── Prop-change reset ─────────────────────────────────────────────
    useEffect(() => {
        setCurrentSrc(preRollAdSrc || videoSrc);
        setIsShowingAd(!!preRollAdSrc);
        setShowBannerAd(false);
    }, [videoSrc, preRollAdSrc]);

    // ── Ad-end handler ────────────────────────────────────────────────
    const handleVideoEnded = () => {
        if (isShowingAd) {
            setCurrentSrc(videoSrc);
            setIsShowingAd(false);
            setTimeout(() => { videoRef.current?.play(); }, 50);
        }
    };

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
        const onTouch = () => revealControls();
        node?.addEventListener('mousemove', onMove);
        node?.addEventListener('touchstart', onTouch, { passive: true });
        scheduleHide.current();
        return () => {
            node?.removeEventListener('mousemove', onMove);
            node?.removeEventListener('touchstart', onTouch);
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Banner-ad timer ───────────────────────────────────────────────
    useEffect(() => {
        if (!isPlaying || isShowingAd || !bannerAdSrc) return;
        if (videoSrc?.includes('youtube.com') || videoSrc?.includes('youtu.be')) return;
        const t = setTimeout(() => setShowBannerAd(true), 5000);
        return () => clearTimeout(t);
    }, [isPlaying, isShowingAd, bannerAdSrc, videoSrc]);

    // ── Video native event listeners ──────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => setCurrentTime(video.currentTime);
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

    // ── Seek flash helper ─────────────────────────────────────────────
    const flashSeek = (label: string, delta: number) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
        setSeekFlash(label);
        setTimeout(() => setSeekFlash(null), 700);
    };

    // ── Tap handler: single = toggle UI, double = ±10s seek ──────────
    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // Ignore clicks that originated inside the controls bar
        if ((e.target as HTMLElement).closest('.custom-controls')) return;

        const now = Date.now();
        const container = containerRef.current;

        if (now - lastTapRef.current < 300 && tapTimerRef.current !== null) {
            // ── Double tap ────────────────────────────────────────────
            window.clearTimeout(tapTimerRef.current);
            tapTimerRef.current = null;
            lastTapRef.current = 0;
            if (container) {
                const { left, width } = container.getBoundingClientRect();
                const relX = (e.clientX - left) / width;
                if (relX < 0.3) flashSeek('-10s', -10);
                else if (relX > 0.7) flashSeek('+10s', +10);
                // middle third → no seek action
            }
        } else {
            // ── Single tap (wait to see if a second follows) ──────────
            lastTapRef.current = now;
            tapTimerRef.current = window.setTimeout(() => {
                tapTimerRef.current = null;
                // Toggle controls visibility; restart hide timer when revealing
                setShowControls(prev => {
                    if (!prev) scheduleHide.current(); // revealing → start timer
                    return !prev;
                });
            }, 300);
        }
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
            onClick={handleContainerClick}
            style={{
                position: 'relative',
                width: '100%',
                maxWidth: '1280px',
                margin: '0 auto',
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: '#000',
                cursor: 'pointer',
                // Prevent iOS long-press selection
                userSelect: 'none',
                WebkitUserSelect: 'none',
            } as React.CSSProperties}
        >
            {/* 16:9 wrapper */}
            <div style={{ position: 'relative', paddingTop: '56.25%', backgroundColor: '#000' }}>

                {/* ── <video> — pointer-events:none, container handles all input ── */}
                <video
                    ref={videoRef}
                    src={currentSrc}
                    poster={isShowingAd ? undefined : poster}
                    playsInline
                    onEnded={handleVideoEnded}
                    style={{
                        position: 'absolute', top: 0, left: 0,
                        width: '100%', height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none', // ← critical: hands all events to container
                    }}
                />

                {/* ── "Ad playing" badge ── */}
                {isShowingAd && (
                    <div style={{
                        position: 'absolute', top: 12, right: 12,
                        background: 'rgba(0,0,0,0.65)',
                        color: 'rgba(255,255,255,0.85)',
                        fontSize: 11, fontWeight: 600,
                        letterSpacing: '0.05em',
                        padding: '4px 10px', borderRadius: 4,
                        backdropFilter: 'blur(6px)',
                        border: '1px solid rgba(214,0,116,0.4)',
                        zIndex: 30, pointerEvents: 'none',
                        textTransform: 'uppercase',
                    }}>
                        Ad playing…
                    </div>
                )}

                {/* ── Double-tap seek flash ── */}
                {seekFlash && (
                    <div style={{
                        position: 'absolute', top: '50%',
                        left: seekFlash.startsWith('-') ? '15%' : '85%',
                        transform: 'translate(-50%, -50%)',
                        fontSize: 20, fontWeight: 700, color: 'white',
                        background: 'rgba(0,0,0,0.6)',
                        padding: '8px 14px', borderRadius: 24,
                        animation: 'seekFade 0.7s ease-out forwards',
                        pointerEvents: 'none', zIndex: 40,
                        whiteSpace: 'nowrap',
                    }}>
                        {seekFlash}
                    </div>
                )}

                {/* ── Banner image ad (lower-third) ── */}
                {showBannerAd && bannerAdSrc && (
                    <div style={{
                        position: 'absolute', bottom: 80, left: 16,
                        borderRadius: 8, overflow: 'hidden',
                        maxWidth: 300,
                        animation: 'slideInLeft 0.5s ease-out',
                        zIndex: 20,
                        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
                        border: '1px solid rgba(214,0,116,0.35)',
                    }}>
                        <button
                            onClick={e => { e.stopPropagation(); setShowBannerAd(false); }}
                            style={{
                                position: 'absolute', top: 5, right: 5,
                                background: 'rgba(0,0,0,0.7)', border: 'none',
                                color: 'white', width: 22, height: 22,
                                borderRadius: '50%', cursor: 'pointer',
                                fontSize: 13, display: 'flex',
                                alignItems: 'center', justifyContent: 'center',
                                zIndex: 21,
                            }}
                        >×</button>
                        <div style={{
                            position: 'absolute', bottom: 0, left: 0, right: 0,
                            background: 'rgba(0,0,0,0.55)', fontSize: 9,
                            color: 'rgba(255,255,255,0.7)', padding: '3px 8px',
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            pointerEvents: 'none',
                        }}>Sponsored</div>
                        <img
                            src={bannerAdSrc} alt="Advertisement" draggable={false}
                            style={{ display: 'block', width: '100%', maxHeight: 130, objectFit: 'cover' }}
                        />
                    </div>
                )}

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
                        zIndex: 2147483647,
                        pointerEvents: showControls ? 'auto' : 'none',
                    }}
                >
                    {/* Large centre play/pause button */}
                    <button
                        onPointerDown={e => togglePlay(e)}
                        style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%, -50%)',
                            background: 'rgba(0,0,0,0.55)',
                            border: '2px solid rgba(255,255,255,0.4)',
                            color: 'white', borderRadius: '50%',
                            width: 64, height: 64,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 26, cursor: 'pointer',
                            backdropFilter: 'blur(4px)',
                            transition: 'background 0.15s',
                        }}
                        aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? '❚❚' : '▶'}
                    </button>

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
                                    background: 'linear-gradient(90deg, #D60074, #db2777)',
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
    const { user, tier } = useAuth();
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);
    const [adUrl, setAdUrl] = useState<string | null>(null);
    const [bannerAdUrl, setBannerAdUrl] = useState<string | null>(null);
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

        import('./lib/api').then(mod => mod.incrementView(video.id));

        // 1. History & Check List (if logged in)
        if (user) {
            addToHistory(user.id, video.id);
            checkInWatchLater(user.id, video.id).then(setInMyList);
        }

        // 2. Load ads for non-premium users (no ads on YouTube links)
        const isYouTube = video.video_url &&
            (video.video_url.includes('youtube.com') || video.video_url.includes('youtu.be'));

        if (tier !== 'premium' && video.ads_enabled && !isYouTube) {
            // Inner async IIFE so we can use await inside a sync useEffect
            (async () => {
                // --- Pre-roll: pick one at random from up to 2 slots ---
                const prerollIds = [video.preroll_ad_id, video.preroll_ad_id_2].filter(Boolean) as string[];
                const pickedPrerollId = prerollIds.length
                    ? prerollIds[Math.floor(Math.random() * prerollIds.length)]
                    : null;

                // --- Banner: pick one at random from up to 2 slots ---
                const bannerIds = [video.banner_ad_id_1, video.banner_ad_id_2].filter(Boolean) as string[];
                const pickedBannerId = bannerIds.length
                    ? bannerIds[Math.floor(Math.random() * bannerIds.length)]
                    : null;

                // Fetch both concurrently
                const [prerollAd, bannerAd] = await Promise.all([
                    pickedPrerollId ? getAdById(pickedPrerollId) : Promise.resolve(null),
                    pickedBannerId ? getAdById(pickedBannerId) : Promise.resolve(null),
                ]);

                setAdUrl(prerollAd && prerollAd.type === 'video' ? prerollAd.url : null);
                setBannerAdUrl(bannerAd && bannerAd.type === 'banner' ? bannerAd.url : null);
            })();
        } else {
            setAdUrl(null);
            setBannerAdUrl(null);
        }
    }, [video, tier, user]);

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
                {/* Back Button */}
                <button
                    onClick={() => navigate('/')}
                    className="nav-icon-btn"
                    style={{
                        position: 'absolute',
                        top: 20,
                        left: 20,
                        zIndex: 100
                    }}
                >
                    <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>

                {/* Video Player Section */}
                <section className="watch-hero">
                    <CustomVideoPlayer
                        videoSrc={video.video_url}
                        poster={video.thumbnail_url}
                        preRollAdSrc={adUrl}
                        bannerAdSrc={bannerAdUrl}
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
                                boxShadow: inMyList ? '0 4px 16px rgba(214, 0, 116, 0.3)' : 'none',
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