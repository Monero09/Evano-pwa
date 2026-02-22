import { useState, useEffect } from 'react';
import { useAuth } from './components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { useToast } from './components/Toast';
import {
    uploadAd,
    getAds,
    fetchVideos,
    assignAdsToVideo,
    toggleVideoAds
} from './lib/api';
import type { Ad, Video } from './lib/types';

// Per-video draft state for the 4 ad slot inputs
type AdDraft = {
    preroll1: string;
    preroll2: string;
    banner1: string;
    banner2: string;
};

export default function AdminAdsPage() {
    const { user, role } = useAuth();
    const navigate = useNavigate();
    const { showToast } = useToast();

    const [ads, setAds] = useState<Ad[]>([]);
    const [videos, setVideos] = useState<Video[]>([]);
    const [loading, setLoading] = useState(true);

    // Upload states
    const [uploadType, setUploadType] = useState<'video' | 'banner'>('video');
    const [adTitle, setAdTitle] = useState('');
    const [adFile, setAdFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);

    // Per-video edit panel state: videoId → open?
    const [editOpen, setEditOpen] = useState<Record<string, boolean>>({});
    // Per-video draft values: videoId → AdDraft
    const [drafts, setDrafts] = useState<Record<string, AdDraft>>({});
    // Per-video saving state
    const [saving, setSaving] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (user && role === 'admin') {
            loadData();
        }
    }, [user, role]);

    const loadData = async () => {
        setLoading(true);
        const [adsData, videosData] = await Promise.all([
            getAds(),
            fetchVideos()
        ]);
        setAds(adsData);
        setVideos(videosData);

        // Seed drafts from current DB values so inputs are pre-filled
        const initialDrafts: Record<string, AdDraft> = {};
        videosData.forEach(v => {
            initialDrafts[v.id] = {
                preroll1: v.preroll_ad_id || '',
                preroll2: v.preroll_ad_id_2 || '',
                banner1: v.banner_ad_id_1 || '',
                banner2: v.banner_ad_id_2 || '',
            };
        });
        setDrafts(initialDrafts);
        setLoading(false);
    };

    const handleUploadAd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adFile || !adTitle) {
            showToast('Please provide title and file', 'error');
            return;
        }

        setUploading(true);
        try {
            await uploadAd(adTitle, uploadType, adFile);
            showToast('Ad uploaded successfully!', 'success');
            setAdTitle('');
            setAdFile(null);
            loadData();
        } catch (error) {
            showToast('Failed to upload ad', 'error');
            console.error(error);
        }
        setUploading(false);
    };

    const toggleEdit = (videoId: string) => {
        setEditOpen(prev => ({ ...prev, [videoId]: !prev[videoId] }));
    };

    const updateDraft = (videoId: string, field: keyof AdDraft, value: string) => {
        setDrafts(prev => ({
            ...prev,
            [videoId]: { ...prev[videoId], [field]: value }
        }));
    };

    const handleSaveAds = async (videoId: string) => {
        const draft = drafts[videoId];
        if (!draft) return;

        setSaving(prev => ({ ...prev, [videoId]: true }));
        try {
            await assignAdsToVideo(videoId, {
                preroll1: draft.preroll1.trim() || null,
                preroll2: draft.preroll2.trim() || null,
                banner1: draft.banner1.trim() || null,
                banner2: draft.banner2.trim() || null,
            });
            showToast('Ad slots saved!', 'success');
            setEditOpen(prev => ({ ...prev, [videoId]: false }));
            loadData();
        } catch (error) {
            showToast('Failed to save ads', 'error');
            console.error(error);
        }
        setSaving(prev => ({ ...prev, [videoId]: false }));
    };

    const handleToggleAds = async (videoId: string, currentState: boolean) => {
        try {
            await toggleVideoAds(videoId, !currentState);
            showToast(`Ads ${!currentState ? 'enabled' : 'disabled'} for video`, 'success');
            loadData();
        } catch (error) {
            showToast('Failed to toggle ads', 'error');
        }
    };

    if (!user || role !== 'admin') {
        return <div style={{ color: 'white', padding: 20 }}>Access Denied</div>;
    }

    if (loading) return <div style={{ color: 'white', padding: 20 }}>Loading...</div>;

    return (
        <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto', color: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
                <h1>Ad Management</h1>
                <button onClick={() => navigate('/admin')} className="auth-btn" style={{ width: 'auto', padding: '8px 16px' }}>
                    Back to Approvals
                </button>
            </div>

            {/* Upload Ad Section */}
            <div style={{ background: '#1A1F2E', padding: 30, borderRadius: 12, marginBottom: 30 }}>
                <h2 style={{ marginBottom: 20 }}>Upload New Ad</h2>
                <form onSubmit={handleUploadAd} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                    <select
                        value={uploadType}
                        onChange={(e) => setUploadType(e.target.value as 'video' | 'banner')}
                        className="auth-input"
                    >
                        <option value="video">Pre-Roll Video Ad</option>
                        <option value="banner">Banner Image Ad</option>
                    </select>

                    <input
                        type="text"
                        placeholder="Ad Title"
                        value={adTitle}
                        onChange={(e) => setAdTitle(e.target.value)}
                        className="auth-input"
                        required
                    />

                    <input
                        type="file"
                        accept={uploadType === 'video' ? 'video/*' : 'image/*'}
                        onChange={(e) => setAdFile(e.target.files?.[0] || null)}
                        className="auth-input"
                        required
                    />

                    <button type="submit" className="auth-btn" disabled={uploading}>
                        {uploading ? 'Uploading...' : 'Upload Ad'}
                    </button>
                </form>
            </div>

            {/* Existing Ads */}
            <div style={{ marginBottom: 40 }}>
                <h2 style={{ marginBottom: 20 }}>Existing Ads ({ads.length})</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20 }}>
                    {ads.map(ad => (
                        <div key={ad.id} style={{ background: '#1A1F2E', padding: 15, borderRadius: 12 }}>
                            {ad.type === 'video' ? (
                                <video src={ad.url} controls style={{ width: '100%', borderRadius: 8 }} />
                            ) : (
                                <img src={ad.url} alt={ad.title} style={{ width: '100%', borderRadius: 8 }} />
                            )}
                            <h4 style={{ margin: '10px 0 5px' }}>{ad.title}</h4>
                            <p style={{ fontSize: 12, color: '#aaa' }}>Type: {ad.type}</p>
                            <p style={{ fontSize: 10, color: '#666', marginTop: 5, wordBreak: 'break-all' }}>ID: {ad.id}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Video Ad Management */}
            <div>
                <h2 style={{ marginBottom: 20 }}>Manage Video Ads</h2>
                <div style={{ display: 'grid', gap: 12 }}>
                    {videos.map(video => {
                        const draft = drafts[video.id] || { preroll1: '', preroll2: '', banner1: '', banner2: '' };
                        const isOpen = !!editOpen[video.id];
                        const isSaving = !!saving[video.id];

                        return (
                            <div
                                key={video.id}
                                style={{
                                    background: '#1A1F2E',
                                    borderRadius: 12,
                                    overflow: 'hidden',
                                    border: isOpen ? '1px solid rgba(214,0,116,0.4)' : '1px solid transparent',
                                    transition: 'border-color 0.2s'
                                }}
                            >
                                {/* Video Row */}
                                <div style={{
                                    padding: '14px 16px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 12
                                }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {video.title}
                                        </div>
                                        <div style={{ fontSize: 11, color: '#888', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                            <span>Ads: {video.ads_enabled ? '✅ Enabled' : '❌ Disabled'}</span>
                                            <span>Pre-roll 1: <span style={{ color: video.preroll_ad_id ? '#D60074' : '#555' }}>{video.preroll_ad_id ? '✓ Set' : 'None'}</span></span>
                                            <span>Pre-roll 2: <span style={{ color: video.preroll_ad_id_2 ? '#D60074' : '#555' }}>{video.preroll_ad_id_2 ? '✓ Set' : 'None'}</span></span>
                                            <span>Banner 1: <span style={{ color: video.banner_ad_id_1 ? '#D60074' : '#555' }}>{video.banner_ad_id_1 ? '✓ Set' : 'None'}</span></span>
                                            <span>Banner 2: <span style={{ color: video.banner_ad_id_2 ? '#D60074' : '#555' }}>{video.banner_ad_id_2 ? '✓ Set' : 'None'}</span></span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                        <button
                                            onClick={() => toggleEdit(video.id)}
                                            style={{
                                                background: isOpen
                                                    ? 'rgba(214,0,116,0.15)'
                                                    : 'rgba(255,255,255,0.08)',
                                                color: isOpen ? '#D60074' : 'white',
                                                border: isOpen ? '1px solid rgba(214,0,116,0.5)' : '1px solid rgba(255,255,255,0.15)',
                                                padding: '7px 14px',
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                                fontSize: 12,
                                                fontWeight: 600,
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {isOpen ? '✕ Close' : '✎ Edit Ads'}
                                        </button>
                                        <button
                                            onClick={() => handleToggleAds(video.id, video.ads_enabled || false)}
                                            style={{
                                                background: video.ads_enabled ? '#ff4d4f' : '#52c41a',
                                                color: 'white',
                                                border: 'none',
                                                padding: '7px 14px',
                                                borderRadius: 6,
                                                cursor: 'pointer',
                                                fontSize: 12,
                                                fontWeight: 600
                                            }}
                                        >
                                            {video.ads_enabled ? 'Disable Ads' : 'Enable Ads'}
                                        </button>
                                    </div>
                                </div>

                                {/* Inline Edit Panel */}
                                {isOpen && (
                                    <div style={{
                                        padding: '0 16px 20px',
                                        borderTop: '1px solid rgba(255,255,255,0.06)',
                                        paddingTop: 16
                                    }}>
                                        <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
                                            Paste the Ad ID from the "Existing Ads" section above. Leave blank to remove.
                                        </p>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 16 }}>
                                            {/* Pre-Roll 1 */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: 11, color: '#aaa', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    🎬 Pre-Roll Ad 1
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Ad ID (video type)"
                                                    value={draft.preroll1}
                                                    onChange={e => updateDraft(video.id, 'preroll1', e.target.value)}
                                                    className="auth-input"
                                                    style={{ fontSize: 12, padding: '8px 10px' }}
                                                />
                                            </div>
                                            {/* Pre-Roll 2 */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: 11, color: '#aaa', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    🎬 Pre-Roll Ad 2
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Ad ID (video type)"
                                                    value={draft.preroll2}
                                                    onChange={e => updateDraft(video.id, 'preroll2', e.target.value)}
                                                    className="auth-input"
                                                    style={{ fontSize: 12, padding: '8px 10px' }}
                                                />
                                            </div>
                                            {/* Banner 1 */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: 11, color: '#aaa', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    🖼 Banner Ad 1
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Ad ID (banner type)"
                                                    value={draft.banner1}
                                                    onChange={e => updateDraft(video.id, 'banner1', e.target.value)}
                                                    className="auth-input"
                                                    style={{ fontSize: 12, padding: '8px 10px' }}
                                                />
                                            </div>
                                            {/* Banner 2 */}
                                            <div>
                                                <label style={{ display: 'block', fontSize: 11, color: '#aaa', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    🖼 Banner Ad 2
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Ad ID (banner type)"
                                                    value={draft.banner2}
                                                    onChange={e => updateDraft(video.id, 'banner2', e.target.value)}
                                                    className="auth-input"
                                                    style={{ fontSize: 12, padding: '8px 10px' }}
                                                />
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleSaveAds(video.id)}
                                            disabled={isSaving}
                                            style={{
                                                background: 'linear-gradient(to right, #581c87, #D60074)',
                                                color: 'white',
                                                border: 'none',
                                                padding: '10px 24px',
                                                borderRadius: 8,
                                                cursor: isSaving ? 'not-allowed' : 'pointer',
                                                fontSize: 13,
                                                fontWeight: 700,
                                                opacity: isSaving ? 0.7 : 1,
                                                transition: 'opacity 0.2s'
                                            }}
                                        >
                                            {isSaving ? 'Saving…' : '💾 Save Ads'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
