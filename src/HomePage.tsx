import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './components/AuthProvider';
import { useToast } from './components/Toast';
import { fetchVideos, getWatchLater, getWatchHistory, getRecommendations } from './lib/api';
import type { Video } from './lib/types';
import HomeHeroBanner from './components/HomeHeroBanner';

export default function HomePage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [videos, setVideos] = useState<Video[]>([]);
    const [watchLaterList, setWatchLaterList] = useState<Video[]>([]);
    const [historyList, setHistoryList] = useState<Video[]>([]);
    const [recommendations, setRecommendations] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    // Helper function to format duration
    const formatDuration = (seconds?: number | null) => {
        if (!seconds) return '';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        loadData();
    }, [user]);

    const loadData = async () => {
        setLoading(true);

        try {
            // fetchVideos now includes is_featured sorting
            const allVideos = await fetchVideos();
            setVideos(allVideos);

            if (user) {
                const [wl, hist, rec] = await Promise.all([
                    getWatchLater(user.id),
                    getWatchHistory(user.id),
                    getRecommendations(user.id)
                ]);
                setWatchLaterList(wl);
                setHistoryList(hist);
                setRecommendations(rec);
            }
        } catch (error) {
            console.error('Error loading data:', error);
            showToast('Failed to load content. Please refresh the page.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleWatch = (id: string) => {
        navigate(`/watch/${id}`);
    };

    const handleSearch = () => {
        navigate('/search');
    };

    // Hero Banner: the single featured video (is_featured === true)
    const heroVideo = videos.find(v => v.is_featured === true) || (videos.length > 0 ? videos[0] : null);

    // Netflix-style rows: fetch once, filter in memory (no extra API calls)
    const movies = videos.filter(v => v.category === 'Movies');
    const music = videos.filter(v => v.category === 'Music');
    const podcast = videos.filter(v => v.category === 'Podcast');
    const documentary = videos.filter(v => v.category === 'Documentary');
    const skitVideo = videos.filter(v => v.category === 'Skit video');

    if (loading && !videos.length) return (
        <div style={{ marginTop: 70, paddingTop: 20 }}>
            <div className="container">
                <div className="videos-row">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="skeleton-card">
                            <div className="skeleton skeleton-thumbnail"></div>
                            <div className="skeleton skeleton-title"></div>
                            <div className="skeleton skeleton-subtitle"></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const VideoRow = ({ title, list }: { title: string, list: Video[] }) => {
        if (!list || list.length === 0) return null;
        return (
            <section className="videos-section">
                <h2 className="section-title">{title}</h2>
                <div className="videos-row">
                    {list.map((vid) => (
                        <div key={vid.id} className="video-card" onClick={() => handleWatch(String(vid.id))}>
                            <div className="video-thumbnail">
                                <img src={vid.thumbnail_url} alt={vid.title} />
                                {vid.duration_seconds && (
                                    <div className="video-duration">{formatDuration(vid.duration_seconds)}</div>
                                )}
                            </div>
                            <h3 className="video-title">{vid.title}</h3>
                            <p className="video-channel">{vid.category}</p>
                        </div>
                    ))}
                </div>
            </section>
        );
    };

    return (
        <div className="home-body">
            {/* Navigation Bar */}
            <nav className="navbar">
                <div className="navbar-logo">
                    <img src="/logo.png" alt="Evano" className="logo-img" />
                </div>
                <div className="navbar-actions">
                    <div className="search-icon-btn" onClick={handleSearch}>
                        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <div className="container">
                {/* ── Hero Ad Banner — in document flow, scrolls naturally ── */}
                <HomeHeroBanner />

                {/* Hero Section */}
                {heroVideo && (
                    <div className="hero">
                        <div className="hero-background" style={{
                            backgroundImage: `linear-gradient(rgba(11, 15, 25, 0.4), rgba(11, 15, 25, 0.6)), url('${heroVideo.thumbnail_url}')`
                        }}></div>
                        <div className="hero-content">
                            <span className="hero-label">Featured</span>
                            <h1 className="hero-title">{heroVideo.title}</h1>
                            <p className="hero-subtitle">{heroVideo.description}</p>
                            <button className="hero-button" onClick={() => handleWatch(heroVideo.id)}>Watch Now</button>
                            {user && (
                                <button
                                    className="hero-button"
                                    style={{ background: 'rgba(255,255,255,0.2)', marginLeft: 10 }}
                                    onClick={() => handleWatch(heroVideo.id)}
                                >
                                    + My List
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Feature Strip */}
                <div className="feature-strip"></div>

                {/* My Lists */}
                {user && (
                    <>
                        <VideoRow title="Continue Watching" list={historyList} />
                        <VideoRow title="My List" list={watchLaterList} />
                        <VideoRow title="Recommended For You" list={recommendations} />
                    </>
                )}

                {/* Category Rows */}
                <VideoRow title="Movies" list={movies} />
                <VideoRow title="Music" list={music} />
                <VideoRow title="Podcast" list={podcast} />
                <VideoRow title="Documentary" list={documentary} />
                <VideoRow title="Skit video" list={skitVideo} />

                {videos.length === 0 && !loading && (
                    <p style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No videos available.</p>
                )}
            </div>
        </div>
    );
}
