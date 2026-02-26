import { useState, useEffect } from 'react';
import { useAuth } from './components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { getWatchHistory, getWatchLater, deleteMyAccount, removeFromWatchLater } from './lib/api';
import type { Video } from './lib/types';
import ConfirmModal from './components/ConfirmModal';
import { useToast } from './components/Toast';

export default function ProfilePage() {
    const { user, profile, logout } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [activeTab, setActiveTab] = useState<'history' | 'watchlist'>('history');
    const [history, setHistory] = useState<Video[]>([]);
    const [watchlist, setWatchlist] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        const loadData = async () => {
            setLoading(true);
            try {
                const [hist, wl] = await Promise.all([
                    getWatchHistory(user.id),
                    getWatchLater(user.id)
                ]);
                setHistory(hist);
                setWatchlist(wl);
            } catch (err) {
                console.error("Failed to load profile data", err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [user, navigate]);

    const handleRemoveFromWatchlist = async (e: React.MouseEvent, videoId: string) => {
        e.stopPropagation();
        if (!user) return;
        try {
            await removeFromWatchLater(user.id, videoId);
            setWatchlist(prev => prev.filter(v => v.id !== videoId));
            showToast('Removed from My List', 'success');
        } catch (error) {
            showToast('Failed to remove video', 'error');
        }
    };

    const handleDeleteAccount = async () => {
        try {
            await deleteMyAccount();
            showToast('Account deleted successfully', 'success');
            logout();
            navigate('/');
        } catch (error) {
            showToast('Failed to delete account', 'error');
        }
    };

    if (!user) return null;

    if (loading) return <div style={{ color: 'white', padding: 20 }}>Loading...</div>;

    const displayVideos = activeTab === 'history' ? history : watchlist;

    return (
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: 20, color: 'white' }}>
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                title="Delete Account"
                message="Are you sure you want to permanently delete your account? This action cannot be undone and will erase all your history, uploaded videos, and data."
                confirmText="Yes, delete my account"
                isDestructive={true}
                onConfirm={handleDeleteAccount}
                onCancel={() => setDeleteModalOpen(false)}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 40 }}>
                <div>
                    <h1 style={{ fontSize: 28, margin: '0 0 8px 0' }}>My Profile</h1>
                    <p style={{ color: '#aaa', fontSize: 14, margin: 0 }}>
                        Signed in as <span style={{ color: 'white', fontWeight: 600 }}>{profile?.username || user.email}</span>
                        {' '}• <span style={{ color: '#22C55E', textTransform: 'capitalize' }}>{profile?.tier || 'Free'}</span> Tier
                    </p>
                </div>
                <button
                    onClick={() => setDeleteModalOpen(true)}
                    style={{
                        background: 'rgba(255, 68, 68, 0.1)',
                        color: '#ff4444',
                        border: '1px solid rgba(255, 68, 68, 0.2)',
                        padding: '8px 16px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontSize: 14,
                        fontWeight: 600,
                        transition: 'all 0.2s',
                        marginTop: 4
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255, 68, 68, 0.2)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)';
                    }}
                >
                    Delete Account
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 24, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                    onClick={() => setActiveTab('history')}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: activeTab === 'history' ? '#22C55E' : '#aaa',
                        fontWeight: activeTab === 'history' ? 700 : 500,
                        fontSize: 15,
                        cursor: 'pointer',
                        position: 'relative',
                        padding: '0 4px 12px 4px',
                        transition: 'color 0.2s ease',
                    }}
                >
                    Watch History
                    {activeTab === 'history' && (
                        <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, background: '#22C55E', borderRadius: '2px 2px 0 0' }} />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('watchlist')}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: activeTab === 'watchlist' ? '#22C55E' : '#aaa',
                        fontWeight: activeTab === 'watchlist' ? 700 : 500,
                        fontSize: 15,
                        cursor: 'pointer',
                        position: 'relative',
                        padding: '0 4px 12px 4px',
                        transition: 'color 0.2s ease',
                    }}
                >
                    My List ({watchlist.length})
                    {activeTab === 'watchlist' && (
                        <div style={{ position: 'absolute', bottom: -1, left: 0, right: 0, height: 2, background: '#22C55E', borderRadius: '2px 2px 0 0' }} />
                    )}
                </button>
            </div>

            {/* Video Grid */}
            {displayVideos.length === 0 ? (
                <div style={{ padding: 60, textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ color: '#aaa', fontSize: 15, margin: 0 }}>
                        {activeTab === 'history'
                            ? "You haven't watched any videos yet."
                            : "Your list is empty. Add videos to watch them later!"}
                    </p>
                </div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 20
                }}>
                    {displayVideos.map(video => (
                        <div key={video.id} style={{ cursor: 'pointer', position: 'relative' }} onClick={() => navigate(`/watch/${video.id}`)}>
                            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', backgroundColor: '#1A1F2E', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <img src={video.thumbnail_url} alt={video.title} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.3s ease' }}
                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                />
                                {/* Bottom Gradient & Title */}
                                <div style={{
                                    position: 'absolute',
                                    inset: 0,
                                    background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.85))',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'flex-end',
                                    padding: '16px 14px',
                                    pointerEvents: 'none'
                                }}>
                                    <h4 style={{ margin: 0, fontSize: 14, color: 'white', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {video.title}
                                    </h4>
                                    <p style={{ margin: 0, fontSize: 12, color: '#aaa', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ color: '#22C55E' }}>{video.category}</span>
                                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
                                        <span>{video.view_count || video.views || 0} views</span>
                                    </p>
                                </div>

                                {/* Remove Button (My List Only) */}
                                {activeTab === 'watchlist' && (
                                    <button
                                        onClick={(e) => handleRemoveFromWatchlist(e, video.id)}
                                        style={{
                                            position: 'absolute',
                                            top: 8, right: 8,
                                            background: 'rgba(0,0,0,0.6)',
                                            color: 'white',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '50%',
                                            width: 32, height: 32,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer',
                                            backdropFilter: 'blur(4px)',
                                            fontSize: 20,
                                            lineHeight: 1,
                                            transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = 'rgba(255, 68, 68, 0.8)';
                                            e.currentTarget.style.borderColor = 'rgba(255, 68, 68, 1)';
                                            e.currentTarget.style.transform = 'scale(1.1)';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = 'rgba(0,0,0,0.6)';
                                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                                            e.currentTarget.style.transform = 'scale(1)';
                                        }}
                                        title="Remove from My List"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
