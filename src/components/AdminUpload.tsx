import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getCategories, uploadEmbedVideo } from '../lib/api';
import { useAuth } from './AuthProvider';
import { supabase } from '../lib/supabase';
import { parseMediaUrl } from './SmartMediaPlayer';


// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
    onSuccess: () => void;
}

type UploadMode = 'file' | 'embed';

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    borderRadius: 8,
    background: '#0B0F19',
    border: '1px solid #2a2e3e',
    color: 'white',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s',
};

const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 700,
    color: '#9ca3af',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
};

const fieldWrap: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminUpload({ onSuccess }: Props) {
    const { user } = useAuth();

    // ── Mode ──────────────────────────────────────────────────────────────────
    const [mode, setMode] = useState<UploadMode>('embed');

    // ── Shared form fields ────────────────────────────────────────────────────
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [categories, setCategories] = useState<string[]>([]);

    // ── Embed mode fields ─────────────────────────────────────────────────────
    const [mediaUrl, setMediaUrl] = useState('');
    const [thumbnailUrl, setThumbnailUrl] = useState('');
    const [thumbFetching, setThumbFetching] = useState(false);
    const [thumbError, setThumbError] = useState('');

    // ── File mode fields ──────────────────────────────────────────────────────
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
    const [videoPreview, setVideoPreview] = useState('');
    const [thumbPreview, setThumbPreview] = useState('');
    const videoDropRef = useRef<HTMLDivElement>(null);
    const thumbDropRef = useRef<HTMLDivElement>(null);

    // ── Submission ────────────────────────────────────────────────────────────
    const [submitting, setSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    // ── Load categories ───────────────────────────────────────────────────────
    useEffect(() => {
        getCategories().then(cats => {
            const names = cats.map(c => c.name);
            setCategories(names);
            setCategory(prev => (names.includes(prev) ? prev : names[0] ?? ''));
        });
    }, []);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Auto-fetch thumbnail when mediaUrl changes (Embed Mode)
    // Supports: YouTube · Spotify · Vimeo · Audiomack
    // ─────────────────────────────────────────────────────────────────────────
    const fetchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const url = mediaUrl.trim();

        if (mode !== 'embed' || !url) {
            setThumbnailUrl('');
            setThumbError('');
            return;
        }

        const parsed = parseMediaUrl(url);

        // ── YouTube — thumbnail available instantly, no network call ──────────
        if (parsed.type === 'youtube') {
            // Extract ID from the embed URL we already built
            const match = parsed.embedUrl.match(/embed\/([^?]+)/);
            const ytId = match?.[1];
            if (ytId) {
                setThumbFetching(false);
                setThumbError('');
                setThumbnailUrl(`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`);
            }
            return;
        }

        // ── All other embed platforms — fetch via oEmbed ──────────────────────
        if (parsed.type === 'native') {
            // Not a recognised embed URL
            setThumbnailUrl('');
            setThumbError('');
            return;
        }

        // Debounce so we don't hammer the APIs while the user is still typing
        setThumbnailUrl('');
        setThumbError('');
        setThumbFetching(true);
        if (fetchDebounce.current) clearTimeout(fetchDebounce.current);

        const oEmbedEndpoints: Record<string, string> = {
            spotify: `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
            vimeo: `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
            audiomack: `https://audiomack.com/oembed?url=${encodeURIComponent(url)}`,
        };

        fetchDebounce.current = setTimeout(async () => {
            try {
                const endpoint = oEmbedEndpoints[parsed.type];
                if (!endpoint) throw new Error(`No oEmbed endpoint for "${parsed.type}"`);

                const res = await fetch(endpoint);
                if (!res.ok) throw new Error(`Could not fetch ${parsed.type} metadata (${res.status})`);
                const json = await res.json();

                // Vimeo returns thumbnail_url_with_play_button or thumbnail_url
                const thumb =
                    json.thumbnail_url_with_play_button ||
                    json.thumbnail_url;

                if (thumb) {
                    setThumbnailUrl(thumb);
                } else {
                    throw new Error(`No thumbnail in ${parsed.type} response`);
                }
            } catch (err: any) {
                setThumbError(err.message || `Failed to load thumbnail`);
            } finally {
                setThumbFetching(false);
            }
        }, 600);
    }, [mediaUrl, mode]);

    // ─────────────────────────────────────────────────────────────────────────
    // File drag-and-drop helpers
    // ─────────────────────────────────────────────────────────────────────────
    const makeDragHandlers = useCallback(
        (onFile: (f: File) => void) => ({
            onDragOver: (e: React.DragEvent) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).style.borderColor = '#22C55E';
            },
            onDragLeave: (e: React.DragEvent) => {
                (e.currentTarget as HTMLElement).style.borderColor = '#2a2e3e';
            },
            onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).style.borderColor = '#2a2e3e';
                const f = e.dataTransfer.files[0];
                if (f) onFile(f);
            },
        }),
        []
    );

    const handleVideoFile = (f: File) => {
        setVideoFile(f);
        setVideoPreview(URL.createObjectURL(f));
    };

    const handleThumbFile = (f: File) => {
        setThumbnailFile(f);
        setThumbPreview(URL.createObjectURL(f));
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Reset form
    // ─────────────────────────────────────────────────────────────────────────
    const resetForm = () => {
        setTitle('');
        setDescription('');
        setMediaUrl('');
        setThumbnailUrl('');
        setThumbError('');
        setVideoFile(null);
        setThumbnailFile(null);
        setVideoPreview('');
        setThumbPreview('');
        setUploadProgress(0);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Submit — Embed mode
    // ─────────────────────────────────────────────────────────────────────────
    const handleEmbedSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (!mediaUrl.trim()) return showToast('Please paste a YouTube or Spotify link.', 'error');
        if (!thumbnailUrl) return showToast('Thumbnail could not be fetched. Check the URL.', 'error');
        if (!title.trim()) return showToast('Please enter a title.', 'error');
        if (!category) return showToast('Please select a category.', 'error');

        try {
            setSubmitting(true);
            await uploadEmbedVideo({
                title: title.trim(),
                category,
                videoUrl: mediaUrl.trim(),
                thumbnailUrl,
                adminUserId: user.id,
            });
            showToast('Embed published successfully! It is now live.', 'success');
            resetForm();
            onSuccess();
        } catch (err: any) {
            showToast(err.message || 'Upload failed', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Submit — File mode (standard upload via R2 presigned URL)
    // ─────────────────────────────────────────────────────────────────────────
    const handleFileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        if (!title.trim()) return showToast('Please enter a title.', 'error');
        if (!description.trim()) return showToast('Please enter a description.', 'error');
        if (!category) return showToast('Please select a category.', 'error');
        if (!videoFile) return showToast('Please select a video file.', 'error');
        if (!thumbnailFile) return showToast('Please select a thumbnail image.', 'error');

        try {
            setSubmitting(true);
            setUploadProgress(0);

            // A. Upload thumbnail → Supabase Storage
            const thumbExt = thumbnailFile.name.split('.').pop();
            const thumbPath = `${user.id}/${Date.now()}_admin.${thumbExt}`;
            const { error: thumbErr } = await supabase.storage
                .from('thumbnails')
                .upload(thumbPath, thumbnailFile, { cacheControl: '3600', upsert: true });
            if (thumbErr) throw new Error(`Thumbnail upload failed: ${thumbErr.message}`);
            const { data: thumbData } = supabase.storage.from('thumbnails').getPublicUrl(thumbPath);

            // B. Pre-signed URL for video → R2
            const presignRes = await fetch('/api/get-upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fileName: videoFile.name,
                    fileType: videoFile.type || 'video/mp4',
                    userId: user.id,
                }),
            });
            if (!presignRes.ok) {
                const err = await presignRes.json().catch(() => ({}));
                throw new Error(`Failed to get upload URL: ${(err as any).error ?? presignRes.statusText}`);
            }
            const { uploadUrl, fileKey } = await presignRes.json();

            // C. Stream video → R2
            await new Promise<void>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.upload.addEventListener('progress', (ev) => {
                    if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
                });
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) { setUploadProgress(100); resolve(); }
                    else reject(new Error(`R2 upload failed: ${xhr.status}`));
                });
                xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
                xhr.open('PUT', uploadUrl);
                xhr.setRequestHeader('Content-Type', videoFile.type || 'video/mp4');
                xhr.send(videoFile);
            });

            const finalVideoUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${fileKey}`;

            // D. Resolve category
            const { data: catData, error: catErr } = await supabase
                .from('categories')
                .select('id')
                .eq('name', category)
                .single();
            if (catErr || !catData) throw new Error(`Category "${category}" not found`);

            // E. Insert → approved immediately since admin uploaded it
            const { error: insertErr } = await supabase.from('videos').insert({
                title: title.trim(),
                description: description.trim(),
                category_id: catData.id,
                video_url: finalVideoUrl,
                thumbnail_url: thumbData.publicUrl,
                status: 'approved',
                uploader_id: user.id,
                created_by: user.id,
                view_count: 0,
                ads_enabled: true,
            });
            if (insertErr) throw new Error(`Failed to save: ${insertErr.message}`);

            showToast('Video published successfully! It is now live.', 'success');
            resetForm();
            onSuccess();
        } catch (err: any) {
            showToast(err.message || 'Upload failed', 'error');
        } finally {
            setSubmitting(false);
            setUploadProgress(0);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div style={{ color: 'white' }}>
            {/* ── Inline Toast ── */}
            {toast && (
                <div style={{
                    position: 'fixed', top: 20, right: 20, zIndex: 3000,
                    background: toast.type === 'success' ? '#22C55E' : '#ef4444',
                    color: 'white', padding: '12px 22px', borderRadius: 10,
                    fontWeight: 600, fontSize: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    animation: 'adminUploadFadeIn 0.25s ease',
                }}>
                    {toast.msg}
                </div>
            )}

            {/* ── Mode Toggle ── */}
            <div style={{
                display: 'flex',
                background: '#0B0F19',
                border: '1px solid #1e2435',
                borderRadius: 12,
                padding: 4,
                marginBottom: 28,
                gap: 4,
                width: 'fit-content',
            }}>
                {(['embed', 'file'] as UploadMode[]).map((m) => (
                    <button
                        key={m}
                        onClick={() => { setMode(m); resetForm(); }}
                        style={{
                            padding: '9px 22px',
                            borderRadius: 9,
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: 13,
                            transition: 'all 0.2s',
                            background: mode === m
                                ? 'linear-gradient(135deg, #14532d, #22C55E)'
                                : 'transparent',
                            color: mode === m ? 'white' : '#6b7280',
                        }}
                    >
                        {m === 'embed' ? '🔗 Paste Embed Link' : '📁 Upload File'}
                    </button>
                ))}
            </div>

            {/* ══════════════════════════════════════════════════════════════
                EMBED MODE
            ══════════════════════════════════════════════════════════════ */}
            {mode === 'embed' && (
                <form onSubmit={handleEmbedSubmit}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* Media URL */}
                        <div style={fieldWrap}>
                            <label style={labelStyle}>YouTube, Spotify, Vimeo, or Audiomack Link *</label>
                            <input
                                type="url"
                                placeholder="Paste a YouTube, Vimeo, Spotify, or Audiomack URL…"
                                value={mediaUrl}
                                onChange={e => setMediaUrl(e.target.value)}
                                style={inputStyle}
                                onFocus={e => { e.currentTarget.style.borderColor = '#22C55E'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.12)'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#2a2e3e'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                            <p style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
                                YouTube · Vimeo · Spotify · Audiomack — thumbnail fetched automatically.
                            </p>
                        </div>

                        {/* Auto-fetched Thumbnail Preview */}
                        {(thumbFetching || thumbnailUrl || thumbError) && (
                            <div style={{
                                background: '#0B0F19',
                                border: '1px solid #1e2435',
                                borderRadius: 12,
                                padding: 16,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 16,
                            }}>
                                <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: 90, flexShrink: 0 }}>
                                    Auto Thumbnail
                                </div>
                                {thumbFetching && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6b7280', fontSize: 13 }}>
                                        <div style={{
                                            width: 16, height: 16, borderRadius: '50%',
                                            border: '2px solid #22C55E', borderTopColor: 'transparent',
                                            animation: 'adminUploadSpin 0.6s linear infinite',
                                        }} />
                                        Fetching thumbnail…
                                    </div>
                                )}
                                {!thumbFetching && thumbError && (
                                    <span style={{ color: '#ef4444', fontSize: 13 }}>⚠ {thumbError}</span>
                                )}
                                {!thumbFetching && thumbnailUrl && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                        <img
                                            src={thumbnailUrl}
                                            alt="Auto-fetched thumbnail"
                                            style={{ width: 120, height: 68, objectFit: 'cover', borderRadius: 8, border: '2px solid rgba(34,197,94,0.4)' }}
                                        />
                                        <span style={{ color: '#22C55E', fontSize: 13, fontWeight: 600 }}>
                                            ✓ Thumbnail ready
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Title */}
                        <div style={fieldWrap}>
                            <label style={labelStyle}>Title *</label>
                            <input
                                type="text"
                                placeholder="Enter a title for this content"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                style={inputStyle}
                                onFocus={e => { e.currentTarget.style.borderColor = '#22C55E'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.12)'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#2a2e3e'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                        </div>

                        {/* Category */}
                        <div style={fieldWrap}>
                            <label style={labelStyle}>Category *</label>
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                style={{ ...inputStyle, cursor: 'pointer' }}
                                onFocus={e => { e.currentTarget.style.borderColor = '#22C55E'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.12)'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#2a2e3e'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <option value="" disabled>Select a category…</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting || !thumbnailUrl || !title.trim() || !category}
                            style={{
                                padding: '13px 32px',
                                borderRadius: 10,
                                border: 'none',
                                fontWeight: 700,
                                fontSize: 15,
                                cursor: submitting || !thumbnailUrl || !title.trim() || !category
                                    ? 'not-allowed' : 'pointer',
                                background: submitting || !thumbnailUrl || !title.trim() || !category
                                    ? '#374151'
                                    : 'linear-gradient(135deg, #14532d, #22C55E)',
                                color: 'white',
                                transition: 'all 0.2s',
                                alignSelf: 'flex-start',
                            }}
                        >
                            {submitting ? 'Publishing…' : '🚀 Publish Embed'}
                        </button>
                    </div>
                </form>
            )}

            {/* ══════════════════════════════════════════════════════════════
                FILE UPLOAD MODE
            ══════════════════════════════════════════════════════════════ */}
            {mode === 'file' && (
                <form onSubmit={handleFileSubmit}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* Title */}
                        <div style={fieldWrap}>
                            <label style={labelStyle}>Title *</label>
                            <input
                                type="text"
                                placeholder="Video title"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                style={inputStyle}
                                onFocus={e => { e.currentTarget.style.borderColor = '#22C55E'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.12)'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#2a2e3e'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                        </div>

                        {/* Description */}
                        <div style={fieldWrap}>
                            <label style={labelStyle}>Description *</label>
                            <textarea
                                placeholder="What is this video about?"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={3}
                                style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                                onFocus={e => { e.currentTarget.style.borderColor = '#22C55E'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.12)'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#2a2e3e'; e.currentTarget.style.boxShadow = 'none'; }}
                            />
                        </div>

                        {/* Video file drop zone */}
                        <div style={fieldWrap}>
                            <label style={labelStyle}>Video File (MP4) *</label>
                            <div
                                ref={videoDropRef}
                                {...makeDragHandlers(handleVideoFile)}
                                onClick={() => document.getElementById('admin-video-input')?.click()}
                                style={{
                                    border: '2px dashed #2a2e3e',
                                    borderRadius: 12,
                                    padding: '28px 20px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    background: '#0B0F19',
                                    transition: 'border-color 0.2s',
                                    position: 'relative',
                                }}
                            >
                                {videoFile ? (
                                    <div>
                                        {videoPreview && (
                                            <video
                                                src={videoPreview}
                                                style={{ maxHeight: 160, borderRadius: 8, marginBottom: 10 }}
                                                controls
                                            />
                                        )}
                                        <p style={{ color: '#22C55E', fontWeight: 600, fontSize: 13 }}>
                                            ✓ {videoFile.name}
                                        </p>
                                        <p style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
                                            {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
                                        <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 4 }}>
                                            Drag & drop a video file here
                                        </p>
                                        <p style={{ color: '#4b5563', fontSize: 11 }}>or click to browse — MP4, MOV, AVI</p>
                                    </div>
                                )}
                                <input
                                    id="admin-video-input"
                                    type="file"
                                    accept="video/*"
                                    style={{ display: 'none' }}
                                    onChange={e => e.target.files?.[0] && handleVideoFile(e.target.files[0])}
                                />
                            </div>
                        </div>

                        {/* Thumbnail drop zone */}
                        <div style={fieldWrap}>
                            <label style={labelStyle}>Thumbnail Image *</label>
                            <div
                                ref={thumbDropRef}
                                {...makeDragHandlers(handleThumbFile)}
                                onClick={() => document.getElementById('admin-thumb-input')?.click()}
                                style={{
                                    border: '2px dashed #2a2e3e',
                                    borderRadius: 12,
                                    padding: '24px 20px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    background: '#0B0F19',
                                    transition: 'border-color 0.2s',
                                }}
                            >
                                {thumbnailFile ? (
                                    <div>
                                        {thumbPreview && (
                                            <img
                                                src={thumbPreview}
                                                alt="Thumbnail preview"
                                                style={{ maxHeight: 120, borderRadius: 8, marginBottom: 10, objectFit: 'cover' }}
                                            />
                                        )}
                                        <p style={{ color: '#22C55E', fontWeight: 600, fontSize: 13 }}>✓ {thumbnailFile.name}</p>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ fontSize: 28, marginBottom: 8 }}>🖼</div>
                                        <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 4 }}>
                                            Drag & drop a thumbnail
                                        </p>
                                        <p style={{ color: '#4b5563', fontSize: 11 }}>JPG, PNG, WEBP — 16:9 recommended</p>
                                    </div>
                                )}
                                <input
                                    id="admin-thumb-input"
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={e => e.target.files?.[0] && handleThumbFile(e.target.files[0])}
                                />
                            </div>
                        </div>

                        {/* Category */}
                        <div style={fieldWrap}>
                            <label style={labelStyle}>Category *</label>
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                style={{ ...inputStyle, cursor: 'pointer' }}
                                onFocus={e => { e.currentTarget.style.borderColor = '#22C55E'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.12)'; }}
                                onBlur={e => { e.currentTarget.style.borderColor = '#2a2e3e'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <option value="" disabled>Select a category…</option>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* Progress Bar */}
                        {submitting && (
                            <div>
                                <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${uploadProgress}%`,
                                        background: 'linear-gradient(90deg, #14532d, #22C55E)',
                                        borderRadius: 99,
                                        transition: 'width 0.25s ease',
                                    }} />
                                </div>
                                <p style={{ fontSize: 12, color: '#6b7280', marginTop: 6, display: 'flex', justifyContent: 'space-between' as const }}>
                                    <span>{uploadProgress < 100 ? 'Uploading video…' : '✓ Saving to database…'}</span>
                                    <span style={{ color: '#22C55E', fontWeight: 700 }}>{uploadProgress}%</span>
                                </p>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={submitting}
                            style={{
                                padding: '13px 32px',
                                borderRadius: 10,
                                border: 'none',
                                fontWeight: 700,
                                fontSize: 15,
                                cursor: submitting ? 'not-allowed' : 'pointer',
                                background: submitting ? '#374151' : 'linear-gradient(135deg, #14532d, #22C55E)',
                                color: 'white',
                                transition: 'all 0.2s',
                                alignSelf: 'flex-start',
                                opacity: submitting ? 0.75 : 1,
                            }}
                        >
                            {submitting
                                ? uploadProgress > 0 ? `Uploading… ${uploadProgress}%` : 'Preparing…'
                                : '🚀 Publish Video'}
                        </button>
                    </div>
                </form>
            )}

            {/* Keyframe animations */}
            <style>{`
                @keyframes adminUploadFadeIn {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes adminUploadSpin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
