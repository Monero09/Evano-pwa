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
    const [showPlayIcon, setShowPlayIcon] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [showControls, setShowControls] = useState(true);
    const [showBannerAd, setShowBannerAd] = useState(false);

    const [currentSrc, setCurrentSrc] = useState(preRollAdSrc || videoSrc);
    const [isShowingAd, setIsShowingAd] = useState(!!preRollAdSrc);

    const hideTimerRef = useRef<number | null>(null);

    // Reset src and ad state when the video or ad source changes (e.g. navigating to a new video)
    useEffect(() => {
        setCurrentSrc(preRollAdSrc || videoSrc);
        setIsShowingAd(!!preRollAdSrc);
    }, [videoSrc, preRollAdSrc]);

    // Handler: when the current video segment ends
    const handleVideoEnded = () => {
        if (isShowingAd) {
            // Ad finished — switch to the real video and autoplay
            setCurrentSrc(videoSrc);
            setIsShowingAd(false);
            // Small timeout ensures the src swap is committed before play()
            setTimeout(() => {
                videoRef.current?.play();
            }, 50);
        }
    };

    // Auto-hide controls
    useEffect(() => {
        const resetHide = () => {
            setShowControls(true);
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = window.setTimeout(() => {
                if (isPlaying) setShowControls(false);
            }, 3000);
        };

        const node = containerRef.current;
        node?.addEventListener('mousemove', resetHide);
        node?.addEventListener('touchstart', resetHide);

        resetHide();
        return () => {
            node?.removeEventListener('mousemove', resetHide);
            node?.removeEventListener('touchstart', resetHide);
            if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        };
    }, [isPlaying]);

    // Show banner ad image 5 seconds after main video starts (not during pre-roll, not for YouTube)
    useEffect(() => {
        // Only show when main video is playing (not during ad)
        if (!isPlaying || isShowingAd) return;

        // Skip if no banner ad or if it's a YouTube video
        if (!bannerAdSrc) return;
        if (videoSrc && (videoSrc.includes('youtube.com') || videoSrc.includes('youtu.be'))) return;

        const timer = setTimeout(() => {
            setShowBannerAd(true);
        }, 5000);

        return () => clearTimeout(timer);
    }, [isPlaying, isShowingAd, bannerAdSrc, videoSrc]);

    // Update time and duration
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            setCurrentTime(video.currentTime);
        };

        const handleLoadedMetadata = () => {
            setDuration(video.duration);
        };

        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, []);

    // Click-to-pause functionality
    const handleVideoClick = () => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play();
            setIsPlaying(true);
        } else {
            video.pause();
            setIsPlaying(false);
        }

        // Show play/pause icon animation
        setShowPlayIcon(true);
        setTimeout(() => setShowPlayIcon(false), 600);
    };

    const togglePlay = () => {
        handleVideoClick();
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const video = videoRef.current;
        const progressBar = progressBarRef.current;
        if (!video || !progressBar) return;

        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        video.currentTime = pos * video.duration;
    };

    const toggleFullscreen = async () => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container || !video) return;

        try {
            if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
                if (container.requestFullscreen) {
                    await container.requestFullscreen();
                } else if ((container as any).webkitRequestFullscreen) {
                    (container as any).webkitRequestFullscreen();
                } else if ((video as any).webkitEnterFullscreen) {
                    (video as any).webkitEnterFullscreen(); // Critical for iOS Safari
                }
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if ((document as any).webkitExitFullscreen) {
                    (document as any).webkitExitFullscreen();
                }
            }
        } catch (e) {
            console.error("Fullscreen error:", e);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div
            ref={containerRef}
            className="custom-player-container"
            style={{
                position: 'relative',
                width: '100%',
                maxWidth: '1280px',
                margin: '0 auto',
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: '#000'
            }}
        >
            {/* Video Element */}
            <div
                onClick={handleVideoClick}
                style={{
                    position: 'relative',
                    paddingTop: '56.25%', // 16:9 aspect ratio
                    cursor: 'pointer',
                    backgroundColor: '#000'
                }}
            >
                {/* "Ad playing" overlay */}
                {isShowingAd && (
                    <div
                        style={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            background: 'rgba(0,0,0,0.65)',
                            color: 'rgba(255,255,255,0.85)',
                            fontSize: '11px',
                            fontWeight: 600,
                            letterSpacing: '0.05em',
                            padding: '4px 10px',
                            borderRadius: '4px',
                            backdropFilter: 'blur(6px)',
                            border: '1px solid rgba(214,0,116,0.4)',
                            zIndex: 20,
                            pointerEvents: 'none',
                            textTransform: 'uppercase'
                        }}
                    >
                        Ad playing…
                    </div>
                )}

                <video
                    ref={videoRef}
                    src={currentSrc}
                    poster={isShowingAd ? undefined : poster}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain'
                    }}
                    playsInline
                    onEnded={handleVideoEnded}
                />

                {/* Center Play/Pause Icon Animation */}
                {showPlayIcon && (
                    <div
                        style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            fontSize: '80px',
                            color: 'white',
                            opacity: 0.9,
                            animation: 'fadeOut 0.6s ease-out',
                            pointerEvents: 'none',
                            zIndex: 10
                        }}
                    >
                        {isPlaying ? '▶' : '❚❚'}
                    </div>
                )}

                {/* Banner Image Ad (Lower Third) */}
                {showBannerAd && bannerAdSrc && (
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '80px',
                            left: '20px',
                            borderRadius: '8px',
                            overflow: 'hidden',
                            maxWidth: '340px',
                            animation: 'slideInLeft 0.5s ease-out',
                            zIndex: 5,
                            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
                            border: '1px solid rgba(214,0,116,0.35)'
                        }}
                    >
                        {/* Close button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowBannerAd(false);
                            }}
                            style={{
                                position: 'absolute',
                                top: '6px',
                                right: '6px',
                                background: 'rgba(0,0,0,0.65)',
                                border: 'none',
                                color: 'white',
                                width: '22px',
                                height: '22px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                fontSize: '13px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 6
                            }}
                        >
                            ×
                        </button>
                        {/* Sponsored label */}
                        <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            background: 'rgba(0,0,0,0.55)',
                            fontSize: '9px',
                            color: 'rgba(255,255,255,0.7)',
                            padding: '3px 8px',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            pointerEvents: 'none'
                        }}>
                            Sponsored
                        </div>
                        <img
                            src={bannerAdSrc}
                            alt="Advertisement"
                            style={{ display: 'block', width: '100%', maxHeight: '140px', objectFit: 'cover' }}
                            draggable={false}
                        />
                    </div>
                )}

                {/* Custom Controls */}
                <div
                    className={`custom-controls ${showControls ? 'visible' : 'hidden'}`}
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.8))',
                        padding: '15px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        opacity: showControls ? 1 : 0,
                        transition: 'opacity 0.3s ease',
                        zIndex: 4
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Progress Bar */}
                    <div
                        ref={progressBarRef}
                        onClick={handleSeek}
                        style={{
                            width: '100%',
                            height: '6px',
                            backgroundColor: 'rgba(255,255,255,0.3)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            position: 'relative'
                        }}
                    >
                        <div
                            style={{
                                width: `${(currentTime / duration) * 100}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #D60074, #db2777)',
                                borderRadius: '3px',
                                transition: 'width 0.1s linear'
                            }}
                        />
                    </div>

                    {/* Control Buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <button
                                onClick={togglePlay}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    padding: 0,
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                {isPlaying ? '❚❚' : '▶'}
                            </button>
                            <div style={{ color: 'white', fontSize: '14px', fontFamily: 'monospace' }}>
                                {formatTime(currentTime)} / {formatTime(duration)}
                            </div>
                        </div>

                        <button
                            onClick={toggleFullscreen}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'white',
                                fontSize: '20px',
                                cursor: 'pointer',
                                padding: 0
                            }}
                        >
                            ⛶
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes fadeOut {
                    0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2); }
                }
                @keyframes slideInLeft {
                    0% { transform: translateX(-100%); opacity: 0; }
                    100% { transform: translateX(0); opacity: 1; }
                }
                @media (max-width: 768px) {
                    .custom-controls {
                        padding: 10px !important;
                        gap: 5px !important;
                    }
                    .custom-controls button {
                        font-size: 18px !important;
                    }
                    .custom-controls div {
                        font-size: 12px !important;
                    }
                    div[style*="bottom: 80px"] {
                        bottom: 60px !important;
                        left: 10px !important;
                        right: 10px !important;
                        max-width: none !important;
                        padding: 10px !important;
                    }
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
                                    }} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}>
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