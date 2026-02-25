import { useEffect, useState } from 'react';
import { useAuth } from './components/AuthProvider';
import { getPendingVideos, updateVideoStatus, getCategories, createCategory, deleteCategory, deleteVideo } from './lib/api';
import type { Category } from './lib/api';
import { supabase } from './lib/supabase';
import type { Video } from './lib/types';

export default function AdminDashboard() {
    const { user, role, loading } = useAuth();
    const [pendingVideos, setPendingVideos] = useState<Video[]>([]);
    const [approvedVideos, setApprovedVideos] = useState<Video[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'categories'>('pending');

    // Categories state
    const [categories, setCategories] = useState<Category[]>([]);
    const [catName, setCatName] = useState('');
    const [catDesc, setCatDesc] = useState('');
    const [catLoading, setCatLoading] = useState(false);
    const [catSaving, setCatSaving] = useState(false);

    // Toast State
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' } | null>(null);

    // Preview Modal State
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        if (user && role === 'admin') {
            loadVideos();
            loadCategories();
        }
    }, [user, role]);

    // Close preview modal on Escape key
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewVideoUrl(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const loadCategories = async () => {
        setCatLoading(true);
        const data = await getCategories();
        setCategories(data);
        setCatLoading(false);
    };

    const handleAddCategory = async () => {
        if (!catName.trim()) return;
        setCatSaving(true);
        try {
            await createCategory(catName, catDesc);
            setCatName('');
            setCatDesc('');
            await loadCategories();
            showToast('Category added!', 'success');
        } catch (err: any) {
            showToast(err.message || 'Failed to add category', 'error');
        } finally {
            setCatSaving(false);
        }
    };

    const handleDeleteCategory = async (id: string, name: string) => {
        if (!window.confirm(`Delete category "${name}"? Videos using it may lose their category.`)) return;
        try {
            await deleteCategory(id);
            await loadCategories();
            showToast('Category deleted.', 'success');
        } catch (err: any) {
            showToast(err.message || 'Failed to delete category', 'error');
        }
    };

    const loadVideos = async () => {
        setIsLoadingData(true);
        const pending = await getPendingVideos();
        setPendingVideos(pending);

        // Fetch approved videos for banner management
        const { data: approved } = await supabase
            .from('videos')
            .select('*')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        setApprovedVideos(approved || []);
        setIsLoadingData(false);
    };

    const handleStatusUpdate = async (id: string, status: 'approved' | 'rejected') => {
        try {
            await updateVideoStatus(id, status);
            // Remove from list
            setPendingVideos(prev => prev.filter(v => v.id !== id));
            showToast(`Video ${status}!`, 'success');

            // Reload approved videos if we approved something
            if (status === 'approved') {
                loadVideos();
            }
        } catch (error) {
            console.error(error);
            showToast('Error updating status', 'error');
        }
    };

    const handleDeleteVideo = async (id: string, title: string, isPending: boolean) => {
        if (!window.confirm(`Are you sure you want to completely delete "${title}"? This cannot be undone.`)) return;

        try {
            await deleteVideo(id);
            if (isPending) {
                setPendingVideos(prev => prev.filter(v => v.id !== id));
            } else {
                setApprovedVideos(prev => prev.filter(v => v.id !== id));
            }
            showToast('Video deleted successfully', 'success');
        } catch (error: any) {
            console.error('Delete error:', error);
            showToast(error.message || 'Failed to delete video', 'error');
        }
    };

    const handleSetFeatured = async (videoId: string) => {
        // Optimistic Update
        const previousState = [...approvedVideos];
        setApprovedVideos(prev => prev.map(v => ({
            ...v,
            is_featured: v.id === videoId
        })));

        try {
            // 1. Find the currently featured video and turn it off safely
            const { error: resetError } = await supabase
                .from('videos')
                .update({ is_featured: false })
                .eq('is_featured', true);

            if (resetError) {
                console.error("Reset Error:", resetError);
                throw new Error("Failed to reset old banner");
            }

            // 2. Turn on the new featured video
            const { error: updateError } = await supabase
                .from('videos')
                .update({ is_featured: true })
                .eq('id', videoId);

            if (updateError) {
                console.error("Update Error:", updateError);
                throw new Error("Failed to set new banner");
            }

            showToast('Banner updated successfully!', 'success');
        } catch (error: any) {
            console.error('Error setting featured:', error);
            showToast(error.message || 'Failed to set featured banner', 'error');
            setApprovedVideos(previousState); // Revert UI on failure
        }
    };

    if (loading) return <div style={{ color: 'white', padding: 20 }}>Loading...</div>;

    if (!user || role !== 'admin') {
        return <div style={{ color: 'white', padding: 20 }}>Access Denied</div>;
    }

    return (
        <div className="admin-container" style={{ padding: 20, maxWidth: 1200, margin: '0 auto', color: 'white' }}>
            {/* Toast Notification */}
            {toast && (
                <div style={{
                    position: 'fixed',
                    top: 20,
                    right: 20,
                    background: toast.type === 'success' ? '#D60074' : '#ff4d4f',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 2000,
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    {toast.msg}
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h1>Admin Dashboard</h1>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => window.location.href = '/admin/ads'} style={{ background: '#D60074', border: 'none', color: 'white', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}>
                        Manage Ads
                    </button>
                    <button onClick={() => window.location.href = '/'} style={{ background: 'transparent', border: '1px solid #555', color: 'white', padding: '8px 16px', borderRadius: 4, cursor: 'pointer' }}>
                        Back to Home
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '2px solid #333' }}>
                <button
                    onClick={() => setActiveTab('pending')}
                    style={{
                        background: activeTab === 'pending' ? 'linear-gradient(to right, #581c87, #db2777)' : 'transparent',
                        border: 'none',
                        color: 'white',
                        padding: '12px 24px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        borderRadius: '8px 8px 0 0',
                        fontSize: '15px'
                    }}
                >
                    Pending Approvals ({pendingVideos.length})
                </button>
                <button
                    onClick={() => setActiveTab('approved')}
                    style={{
                        background: activeTab === 'approved' ? 'linear-gradient(to right, #581c87, #db2777)' : 'transparent',
                        border: 'none',
                        color: 'white',
                        padding: '12px 24px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        borderRadius: '8px 8px 0 0',
                        fontSize: '15px'
                    }}
                >
                    Manage Videos ({approvedVideos.length})
                </button>
                <button
                    onClick={() => setActiveTab('categories')}
                    style={{
                        background: activeTab === 'categories' ? 'linear-gradient(to right, #581c87, #db2777)' : 'transparent',
                        border: 'none',
                        color: 'white',
                        padding: '12px 24px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        borderRadius: '8px 8px 0 0',
                        fontSize: '15px'
                    }}
                >
                    🗂 Categories ({categories.length})
                </button>
            </div>

            {isLoadingData ? (
                <p>Loading videos...</p>
            ) : activeTab === 'pending' ? (
                // PENDING APPROVALS TAB
                pendingVideos.length === 0 ? (
                    <div style={{ background: '#1A1F2E', padding: 40, borderRadius: 10, textAlign: 'center', color: '#aaa' }}>
                        No pending videos to review.
                    </div>
                ) : (
                    <div className="video-list">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                            {pendingVideos.map((vid) => (
                                <div key={vid.id} style={{ background: '#1A1F2E', padding: 15, borderRadius: 10, position: 'relative' }}>
                                    <div style={{ position: 'relative', height: 160 }}>
                                        <img src={vid.thumbnail_url} alt={vid.title} style={{ width: '100%', borderRadius: 8, height: '100%', objectFit: 'cover' }} />
                                        <span style={{ position: 'absolute', top: 8, right: 8, background: '#D60074', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>
                                            PENDING
                                        </span>
                                    </div>
                                    <h3 style={{ margin: '10px 0 5px', fontSize: 16 }}>{vid.title}</h3>
                                    <p style={{ fontSize: 12, color: '#aaa' }}>{vid.category}</p>
                                    <p style={{ fontSize: 13, color: '#ccc', margin: '10px 0', height: 40, overflow: 'hidden' }}>{vid.description}</p>

                                    <div style={{ display: 'flex', gap: 10, marginTop: 15 }}>
                                        <button
                                            onClick={() => handleStatusUpdate(vid.id, 'rejected')}
                                            style={{ flex: 1, background: '#ff4d4f', color: 'white', border: 'none', padding: '8px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            Reject
                                        </button>
                                        <button
                                            onClick={() => handleStatusUpdate(vid.id, 'approved')}
                                            style={{ flex: 1, background: '#52c41a', color: 'white', border: 'none', padding: '8px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
                                        >
                                            Approve
                                        </button>
                                    </div>
                                    <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                                        <button
                                            onClick={() => setPreviewVideoUrl(vid.video_url)}
                                            style={{
                                                flex: 1,
                                                background: 'linear-gradient(135deg, #581c87, #D60074)',
                                                color: 'white',
                                                border: 'none',
                                                padding: '8px',
                                                borderRadius: 4,
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: 13,
                                            }}
                                        >
                                            ▶ Watch
                                        </button>
                                        <button
                                            onClick={() => handleDeleteVideo(vid.id, vid.title, true)}
                                            style={{ background: 'transparent', color: '#ff4d4f', border: '1px solid #ff4d4f', padding: '8px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            ) : activeTab === 'approved' ? (
                // MANAGE VIDEOS TAB (Banner Control)
                <div>
                    <p style={{ color: '#aaa', marginBottom: 20 }}>Set which video appears as the Hero Banner on the homepage.</p>
                    {approvedVideos.length === 0 ? (
                        <div style={{ background: '#1A1F2E', padding: 40, borderRadius: 10, textAlign: 'center', color: '#aaa' }}>
                            No approved videos yet.
                        </div>
                    ) : (
                        <div style={{ background: '#1A1F2E', borderRadius: 10, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#0B0F19', borderBottom: '2px solid #333' }}>
                                        <th style={{ padding: '15px', textAlign: 'left', fontSize: '14px', fontWeight: 'bold' }}>Thumbnail</th>
                                        <th style={{ padding: '15px', textAlign: 'left', fontSize: '14px', fontWeight: 'bold' }}>Title</th>
                                        <th style={{ padding: '15px', textAlign: 'left', fontSize: '14px', fontWeight: 'bold' }}>Category</th>
                                        <th style={{ padding: '15px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>Views</th>
                                        <th style={{ padding: '15px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>Featured</th>
                                        <th style={{ padding: '15px', textAlign: 'center', fontSize: '14px', fontWeight: 'bold' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {approvedVideos.map((vid, index) => (
                                        <tr key={vid.id} style={{ borderBottom: '1px solid #333', background: index % 2 === 0 ? '#1A1F2E' : '#141820' }}>
                                            <td style={{ padding: '12px' }}>
                                                <img
                                                    src={vid.thumbnail_url}
                                                    alt={vid.title}
                                                    style={{ width: 80, height: 45, objectFit: 'cover', borderRadius: 4 }}
                                                />
                                            </td>
                                            <td style={{ padding: '12px', maxWidth: '300px' }}>
                                                <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>{vid.title}</div>
                                                <div style={{ fontSize: '12px', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {vid.description}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px', fontSize: '14px', color: '#aaa' }}>{vid.category}</td>
                                            <td style={{ padding: '12px', textAlign: 'center', fontSize: '14px' }}>
                                                {vid.view_count || 0}
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleSetFeatured(vid.id)}
                                                    style={{
                                                        background: vid.is_featured
                                                            ? 'linear-gradient(to right, #581c87, #db2777)'
                                                            : '#555',
                                                        color: 'white',
                                                        border: vid.is_featured ? '2px solid #D60074' : 'none',
                                                        padding: '8px 16px',
                                                        borderRadius: 6,
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold',
                                                        fontSize: '12px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        margin: '0 auto',
                                                        boxShadow: vid.is_featured ? '0 0 15px rgba(214, 0, 116, 0.5)' : 'none',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {vid.is_featured ? (
                                                        <>
                                                            <span>★</span> ACTIVE BANNER
                                                        </>
                                                    ) : (
                                                        'Set as Banner'
                                                    )}
                                                </button>
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleDeleteVideo(vid.id, vid.title, false)}
                                                    style={{
                                                        background: 'transparent',
                                                        color: '#ff4d4f',
                                                        border: '1px solid #ff4d4f',
                                                        padding: '6px 12px',
                                                        borderRadius: 6,
                                                        cursor: 'pointer',
                                                        fontWeight: 'bold',
                                                        fontSize: '12px',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 77, 79, 0.1)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            ) : (
                // MANAGE CATEGORIES TAB
                <div>
                    <p style={{ color: '#aaa', marginBottom: 20 }}>
                        Add or remove video categories. Changes apply immediately to creator upload forms.
                    </p>

                    {/* Add Category Form */}
                    <div style={{
                        background: '#1A1F2E',
                        border: '1px solid rgba(214, 0, 116, 0.2)',
                        borderRadius: 12,
                        padding: 24,
                        marginBottom: 24
                    }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#D60074' }}>Add New Category</h3>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={{ fontSize: 12, color: '#aaa', fontWeight: 600 }}>Category Name *</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Documentaries"
                                    value={catName}
                                    onChange={(e) => setCatName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                                    style={{
                                        background: '#0B0F19',
                                        border: '1px solid #333',
                                        borderRadius: 8,
                                        padding: '10px 14px',
                                        color: 'white',
                                        fontSize: 14,
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.currentTarget.style.borderColor = '#D60074'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = '#333'}
                                />
                            </div>
                            <div style={{ flex: '2 1 260px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <label style={{ fontSize: 12, color: '#aaa', fontWeight: 600 }}>Description (optional)</label>
                                <input
                                    type="text"
                                    placeholder="Short description of this category"
                                    value={catDesc}
                                    onChange={(e) => setCatDesc(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                                    style={{
                                        background: '#0B0F19',
                                        border: '1px solid #333',
                                        borderRadius: 8,
                                        padding: '10px 14px',
                                        color: 'white',
                                        fontSize: 14,
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                    onFocus={(e) => e.currentTarget.style.borderColor = '#D60074'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = '#333'}
                                />
                            </div>
                            <button
                                onClick={handleAddCategory}
                                disabled={catSaving || !catName.trim()}
                                style={{
                                    background: catSaving || !catName.trim()
                                        ? '#555'
                                        : 'linear-gradient(to right, #581c87, #db2777)',
                                    border: 'none',
                                    color: 'white',
                                    padding: '10px 24px',
                                    borderRadius: 8,
                                    cursor: catSaving || !catName.trim() ? 'not-allowed' : 'pointer',
                                    fontWeight: 700,
                                    fontSize: 14,
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {catSaving ? 'Adding...' : '+ Add Category'}
                            </button>
                        </div>
                    </div>

                    {/* Categories Table */}
                    {catLoading ? (
                        <p style={{ color: '#aaa' }}>Loading categories...</p>
                    ) : categories.length === 0 ? (
                        <div style={{ background: '#1A1F2E', padding: 40, borderRadius: 10, textAlign: 'center', color: '#aaa' }}>
                            No categories found. Add one above.
                        </div>
                    ) : (
                        <div style={{ background: '#1A1F2E', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#0B0F19', borderBottom: '2px solid #333' }}>
                                        <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>#</th>
                                        <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</th>
                                        <th style={{ padding: '14px 20px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</th>
                                        <th style={{ padding: '14px 20px', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.map((cat, idx) => (
                                        <tr
                                            key={cat.id}
                                            style={{ borderBottom: '1px solid #2a2a3a', background: idx % 2 === 0 ? '#1A1F2E' : '#141820', transition: 'background 0.15s' }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = '#1e2438'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#1A1F2E' : '#141820'}
                                        >
                                            <td style={{ padding: '14px 20px', fontSize: 13, color: '#555', fontWeight: 600 }}>{idx + 1}</td>
                                            <td style={{ padding: '14px 20px' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    background: 'rgba(214, 0, 116, 0.12)',
                                                    border: '1px solid rgba(214, 0, 116, 0.25)',
                                                    color: '#f472b6',
                                                    padding: '4px 12px',
                                                    borderRadius: 20,
                                                    fontSize: 13,
                                                    fontWeight: 600
                                                }}>
                                                    {cat.name}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 20px', fontSize: 13, color: '#888' }}>
                                                {cat.description || <span style={{ color: '#444', fontStyle: 'italic' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                                    style={{
                                                        background: 'rgba(255, 68, 68, 0.1)',
                                                        border: '1px solid rgba(255, 68, 68, 0.3)',
                                                        color: '#ff4d4f',
                                                        padding: '6px 16px',
                                                        borderRadius: 6,
                                                        cursor: 'pointer',
                                                        fontWeight: 600,
                                                        fontSize: 13,
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255,68,68,0.25)';
                                                        e.currentTarget.style.borderColor = 'rgba(255,68,68,0.6)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'rgba(255,68,68,0.1)';
                                                        e.currentTarget.style.borderColor = 'rgba(255,68,68,0.3)';
                                                    }}
                                                >
                                                    🗑 Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes modalIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to   { opacity: 1; transform: scale(1); }
                }
            `}</style>

            {/* ── Video Preview Modal ── */}
            {previewVideoUrl && (
                <div
                    onClick={() => setPreviewVideoUrl(null)}
                    style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(0,0,0,0.88)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20,
                        backdropFilter: 'blur(6px)',
                    }}
                >
                    {/* Stop click inside from closing */}
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            position: 'relative',
                            width: '100%',
                            maxWidth: 900,
                            animation: 'modalIn 0.2s ease',
                        }}
                    >
                        {/* Close button */}
                        <button
                            onClick={() => setPreviewVideoUrl(null)}
                            style={{
                                position: 'absolute',
                                top: -16,
                                right: -16,
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: '#D60074',
                                border: 'none',
                                color: 'white',
                                fontSize: 20,
                                lineHeight: 1,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1,
                                boxShadow: '0 4px 16px rgba(214,0,116,0.5)',
                            }}
                            aria-label="Close preview"
                        >
                            ✕
                        </button>

                        {/* Video player */}
                        <video
                            src={previewVideoUrl}
                            controls
                            autoPlay
                            playsInline
                            style={{
                                width: '100%',
                                borderRadius: 12,
                                boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
                                display: 'block',
                                maxHeight: '80vh',
                                background: '#000',
                            }}
                        />

                        {/* Video title strip */}
                        <div style={{
                            background: 'rgba(0,0,0,0.6)',
                            backdropFilter: 'blur(8px)',
                            padding: '10px 16px',
                            borderRadius: '0 0 12px 12px',
                            marginTop: -4,
                            fontSize: 13,
                            color: '#ccc',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <span>Admin Preview — <strong style={{ color: 'white' }}>not yet live</strong></span>
                            <span style={{ fontSize: 11, color: '#888' }}>Press ESC to close</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
