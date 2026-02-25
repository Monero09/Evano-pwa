import React, { useState, useEffect } from 'react';
import { uploadVideo, getMyVideos, deleteVideo, getCategories } from './lib/api';
import type { Video } from './lib/types';
import { useAuth } from './components/AuthProvider';
import { useToast } from './components/Toast';
import { useNavigate } from 'react-router-dom';
import CreatorAnalytics from './components/CreatorAnalytics';
import ConfirmModal from './components/ConfirmModal';

export default function CreatorDashboard() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // Stats state
    const [myVideos, setMyVideos] = useState<Video[]>([]);
    const [totalViews, setTotalViews] = useState(0);
    const [categories, setCategories] = useState<string[]>([]);

    // Confirm delete modal
    type PendingAction = { title: string; message: string; action: () => Promise<void> };
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

    useEffect(() => {
        if (user) {
            getMyVideos(user.id).then(videos => {
                setMyVideos(videos);
                const views = videos.reduce((acc, curr) => acc + (curr.views || 0), 0);
                setTotalViews(views);
            });
        }
        // Load categories dynamically
        getCategories().then(cats => {
            const catNames = cats.map(c => c.name);
            setCategories(catNames);
            setCategory(prev => catNames.includes(prev) ? prev : (catNames.length > 0 ? catNames[0] : ''));
        });
    }, [user]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'video' | 'thumb') => {
        if (e.target.files && e.target.files[0]) {
            if (type === 'video') setVideoFile(e.target.files[0]);
            else setThumbnailFile(e.target.files[0]);
        }
    };

    const handleDeleteVideo = (video: Video) => {
        setPendingAction({
            title: 'Delete Video',
            message: `Permanently delete "${video.title}"? This cannot be undone.`,
            action: async () => {
                await deleteVideo(video.id);
                setMyVideos(prev => prev.filter(v => v.id !== video.id));
                setTotalViews(prev => Math.max(0, prev - (video.views || 0)));
                showToast('Video deleted.', 'success');
            },
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !title || !description || !videoFile || !thumbnailFile || !category) {
            showToast('Please fill all fields, select a category, and upload both files.', 'error');
            return;
        }

        try {
            setUploading(true);
            setUploadProgress(0);
            await uploadVideo({
                title,
                description,
                category,
                videoFile,
                thumbnailFile
            }, user.id, setUploadProgress);

            showToast('Video uploaded successfully! It is now pending approval.', 'success');
            navigate('/');
        } catch (error: any) {
            console.error(error);
            showToast(`Upload failed: ${error.message}`, 'error');
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    return (
        <div className="dashboard-container" style={{ padding: 20, maxWidth: 1000, margin: '0 auto', color: 'white', marginTop: 70 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                <h1 className="page-title">Creator Studio</h1>
                <button onClick={() => navigate('/')} className="btn-secondary">
                    ← Back to Home
                </button>
            </div>

            {/* Analytics Section */}
            <CreatorAnalytics myVideos={myVideos} totalViews={totalViews} />

            <h2>Upload New Video</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                <input
                    placeholder="Video Title" value={title} onChange={(e) => setTitle(e.target.value)}
                    style={{ padding: 12, borderRadius: 8, background: '#1A1F2E', border: '1px solid #333', color: 'white' }}
                />
                <textarea
                    placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)}
                    style={{ padding: 12, borderRadius: 8, background: '#1A1F2E', border: '1px solid #333', color: 'white', minHeight: 100 }}
                />

                <div style={{ background: '#1A1F2E', padding: 12, borderRadius: 8, border: '1px solid #333' }}>
                    <label style={{ display: 'block', marginBottom: 8, color: '#aaa', fontSize: 13 }}>Thumbnail Image</label>
                    <input
                        type="file" accept="image/*" onChange={(e) => handleFileChange(e, 'thumb')}
                        style={{ color: 'white' }}
                    />
                </div>

                <div style={{ background: '#1A1F2E', padding: 12, borderRadius: 8, border: '1px solid #333' }}>
                    <label style={{ display: 'block', marginBottom: 8, color: '#aaa', fontSize: 13 }}>Video File (MP4)</label>
                    <input
                        type="file" accept="video/*" onChange={(e) => handleFileChange(e, 'video')}
                        style={{ color: 'white' }}
                    />
                </div>

                <select
                    value={category} onChange={(e) => setCategory(e.target.value)}
                    style={{ padding: 12, borderRadius: 8, background: '#1A1F2E', border: '1px solid #333', color: 'white' }}
                    required
                >
                    <option value="" disabled>Select a Category...</option>
                    {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>

                <button
                    type="submit"
                    disabled={uploading}
                    className="btn-primary"
                    style={{
                        opacity: uploading ? 0.7 : 1,
                        cursor: uploading ? 'not-allowed' : 'pointer'
                    }}
                >
                    {uploading
                        ? uploadProgress > 0
                            ? `Uploading… ${uploadProgress}%`
                            : 'Preparing upload…'
                        : 'Upload Video'}
                </button>

                {/* ── Upload Progress Bar ── */}
                {uploading && (
                    <div style={{ marginTop: 4 }}>
                        {/* Track */}
                        <div style={{
                            width: '100%',
                            height: 8,
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: 99,
                            overflow: 'hidden',
                        }}>
                            {/* Fill */}
                            <div style={{
                                height: '100%',
                                width: `${uploadProgress}%`,
                                background: 'linear-gradient(90deg, #14532d, #22C55E)',
                                borderRadius: 99,
                                transition: 'width 0.25s ease',
                                boxShadow: '0 0 8px rgba(34, 197, 94, 0.2)',
                            }} />
                        </div>
                        <div style={{
                            marginTop: 6,
                            fontSize: 12,
                            color: '#aaa',
                            display: 'flex',
                            justifyContent: 'space-between'
                        }}>
                            <span>
                                {uploadProgress < 100
                                    ? uploadProgress === 0
                                        ? 'Uploading thumbnail…'
                                        : 'Uploading video to R2…'
                                    : '✓ Saving to database…'}
                            </span>
                            <span style={{ color: '#22C55E', fontWeight: 700 }}>
                                {uploadProgress}%
                            </span>
                        </div>
                    </div>
                )}
            </form>

            {/* My Videos List */}
            {myVideos.length > 0 && (
                <div style={{ marginTop: 60 }}>
                    <h2 style={{ marginBottom: 24 }}>My Videos</h2>
                    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
                        <div style={{ display: 'grid', gap: 12, minWidth: 460 }}>
                            {myVideos.map((video) => (
                                <div key={video.id} style={{
                                    background: 'rgba(26, 31, 46, 0.6)',
                                    border: `1px solid ${video.status === 'rejected'
                                        ? 'rgba(255,77,79,0.25)'
                                        : 'rgba(34, 197, 94, 0.1)'
                                        }`,
                                    borderRadius: 12,
                                    padding: 16,
                                    display: 'flex',
                                    gap: 16,
                                    alignItems: 'center',
                                    transition: 'all 0.2s ease',
                                    position: 'relative',
                                }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor =
                                        video.status === 'rejected' ? 'rgba(255,77,79,0.5)' : 'rgba(34, 197, 94, 0.3)'}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor =
                                        video.status === 'rejected' ? 'rgba(255,77,79,0.25)' : 'rgba(34, 197, 94, 0.1)'}
                                >
                                    <img src={video.thumbnail_url} alt={video.title} style={{ width: 100, height: 60, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <h3 style={{ marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title}</h3>
                                        <p style={{ fontSize: 12, color: '#B0B8C1', marginBottom: 8 }}>{video.views || 0} views</p>
                                        <span className={`badge badge-${video.status === 'approved' ? 'green'
                                            : video.status === 'pending' ? 'yellow'
                                                : 'red'
                                            }`}>
                                            {video.status}
                                        </span>
                                        {video.status === 'rejected' && (
                                            <p style={{ fontSize: 11, color: '#ff4d4f', marginTop: 6 }}>
                                                This video was rejected. You may delete it and re-upload.
                                            </p>
                                        )}
                                    </div>

                                    {/* Delete button — always visible, top-right of card */}
                                    <button
                                        onClick={() => handleDeleteVideo(video)}
                                        title="Delete video"
                                        style={{
                                            flexShrink: 0,
                                            background: 'transparent',
                                            border: '1px solid rgba(255,77,79,0.4)',
                                            color: '#ff4d4f',
                                            borderRadius: 8,
                                            padding: '6px 12px',
                                            cursor: 'pointer',
                                            fontSize: 13,
                                            fontWeight: 600,
                                            transition: 'all 0.15s ease',
                                            whiteSpace: 'nowrap',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,77,79,0.12)';
                                            e.currentTarget.style.borderColor = '#ff4d4f';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'transparent';
                                            e.currentTarget.style.borderColor = 'rgba(255,77,79,0.4)';
                                        }}
                                    >
                                        🗑 Delete
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>{/* end scroll wrapper */}
                </div>
            )}

            {/* Confirm Delete Modal */}
            <ConfirmModal
                isOpen={!!pendingAction}
                title={pendingAction?.title ?? ''}
                message={pendingAction?.message ?? ''}
                confirmText="Yes, Delete Forever"
                isDestructive
                onCancel={() => setPendingAction(null)}
                onConfirm={async () => {
                    if (!pendingAction) return;
                    try {
                        await pendingAction.action();
                    } catch (err: any) {
                        showToast(err.message || 'Failed to delete video', 'error');
                    } finally {
                        setPendingAction(null);
                    }
                }}
            />
        </div>
    );
}
