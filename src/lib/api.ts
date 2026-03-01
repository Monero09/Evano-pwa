import { supabase } from './supabase';
import type { Ad, Video, VideoUploadData } from './types';

export type { Ad, Video, VideoUploadData }; // Re-export for compatibility

// Public CDN base for R2 — safe to expose (read-only URL, no credentials)
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL as string;


// --- HELPERS ---
async function uploadFileToStorage(bucket: string, path: string, file: File): Promise<string | null> {
    try {
        const { error } = await supabase.storage
            .from(bucket)
            .upload(path, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) {
            console.error(`Upload failed: ${error.message}`);
            return null;
        }

        const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(path);

        return publicUrl;
    } catch (e) {
        console.error("Upload error:", e);
        return null;
    }
}

// --- 1. FETCH VIDEOS (VIEWER) ---
export async function fetchVideos(): Promise<Video[]> {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('*, category:categories(name)')
            .eq('status', 'approved')
            .order('is_featured', { ascending: false, nullsFirst: false }) // Featured videos first
            .order('created_at', { ascending: false });

        if (error) {
            console.error("Fetch error:", error.message);
            return [];
        }

        // Map database response to our interface
        return (data || []).map((video: any) => ({
            ...video,
            category: video.category?.name || 'Other',
            views: video.view_count || 0, // Map view_count to views for backward compatibility
        })) as Video[];
    } catch (e) {
        console.error("Fetch error:", e);
        return [];
    }
}

// --- 2. UPLOAD VIDEO (CREATOR) ---
export async function uploadVideo(
    uploadData: VideoUploadData,
    userId: string,
    onProgress?: (percent: number) => void
) {
    const { title, description, category, videoFile, thumbnailFile } = uploadData;

    // A. Upload Thumbnail → Supabase Storage (small files, fine here)
    const thumbExt = thumbnailFile.name.split('.').pop();
    const thumbName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${thumbExt}`;
    const thumbPath = `${userId}/${thumbName}`;

    const { error: thumbError } = await supabase.storage
        .from('thumbnails')
        .upload(thumbPath, thumbnailFile, { cacheControl: '3600', upsert: true });

    if (thumbError) throw new Error(`Failed to upload thumbnail: ${thumbError.message}`);

    const { data: thumbUrlData } = supabase.storage
        .from('thumbnails')
        .getPublicUrl(thumbPath);

    const thumbnailUrl = thumbUrlData.publicUrl;

    // B. Request a pre-signed PUT URL from the serverless function
    //    (R2 credentials stay server-side — never in the browser bundle)
    const presignRes = await fetch('/api/get-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileName: videoFile.name,
            fileType: videoFile.type || 'video/mp4',
            userId,
        }),
    });

    if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(`Failed to get upload URL: ${err.error ?? presignRes.statusText}`);
    }

    const { uploadUrl, fileKey } = await presignRes.json();

    // C. Stream the video file directly from the browser → R2 via XHR
    //    (XHR lets us track real upload progress; fetch does not)
    await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        });

        xhr.addEventListener('load', () => {
            // R2 returns 200 on success
            if (xhr.status >= 200 && xhr.status < 300) {
                onProgress?.(100);
                resolve();
            } else {
                reject(new Error(`R2 upload failed with status ${xhr.status}`));
            }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error during video upload')));
        xhr.addEventListener('abort', () => reject(new Error('Video upload was aborted')));

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', videoFile.type || 'video/mp4');
        xhr.send(videoFile);
    });

    // D. Construct the public CDN URL from the key returned by the serverless function
    const finalVideoUrl = `${R2_PUBLIC_URL}/${fileKey}`;

    // E. Get category_id from category name
    const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('name', category)
        .single();

    if (categoryError || !categoryData) {
        throw new Error(`Category "${category}" not found in database`);
    }

    // F. Insert Metadata into Supabase DB
    const { data, error } = await supabase
        .from('videos')
        .insert({
            title,
            description,
            category_id: categoryData.id,
            video_url: finalVideoUrl,   // R2 public CDN URL
            thumbnail_url: thumbnailUrl,
            status: 'pending',          // requires admin approval before going live
            uploader_id: userId,        // NOT NULL — required
            created_by: userId,         // backward compat
            view_count: 0,
            ads_enabled: true
        })
        .select()
        .single();

    if (error) throw new Error(`Failed to save video metadata: ${error.message}`);
    return data;
}

// --- 3. GET PENDING VIDEOS (ADMIN) ---
export async function getPendingVideos(): Promise<Video[]> {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('*, category:categories(name)')
            .eq('status', 'pending');

        if (error) {
            console.error("Fetch pending videos error:", error.message);
            return [];
        }
        return (data || []).map((video: any) => ({
            ...video,
            category: video.category?.name || 'Other',
            views: video.view_count || 0,
        })) as Video[];
    } catch (e) {
        console.error("Fetch pending videos error:", e);
        return [];
    }
}

// --- 4. UPDATE STATUS (ADMIN) ---
export async function updateVideoStatus(id: string, status: 'approved' | 'rejected') {
    const { data, error } = await supabase
        .from('videos')
        .update({ status })
        .eq('id', id)
        .select();

    if (error) throw new Error(`Failed to update status: ${error.message}`);
    return data;
}

/**
 * Approve a pending video and notify the creator.
 * Combines status update + notification insert in one call.
 */
export async function approveVideo(videoId: string): Promise<void> {
    // 1. Fetch the video to get creator id and title
    const { data: video, error: fetchErr } = await supabase
        .from('videos')
        .select('title, uploader_id')
        .eq('id', videoId)
        .single();

    if (fetchErr || !video) throw new Error(`Could not fetch video: ${fetchErr?.message}`);

    // 2. Update status
    await updateVideoStatus(videoId, 'approved');

    // 3. Insert notification for the creator
    const { error: notifErr } = await supabase
        .from('notifications')
        .insert({
            user_id: video.uploader_id,
            title: 'Video Approved! ✅',
            message: `Your video "${video.title}" is now live.`,
        });

    if (notifErr) console.error('Failed to send approval notification:', notifErr.message);
}

/**
 * Reject a pending video and notify the creator.
 */
export async function rejectVideo(videoId: string): Promise<void> {
    // 1. Fetch the video
    const { data: video, error: fetchErr } = await supabase
        .from('videos')
        .select('title, uploader_id')
        .eq('id', videoId)
        .single();

    if (fetchErr || !video) throw new Error(`Could not fetch video: ${fetchErr?.message}`);

    // 2. Update status
    await updateVideoStatus(videoId, 'rejected');

    // 3. Insert notification for the creator
    const { error: notifErr } = await supabase
        .from('notifications')
        .insert({
            user_id: video.uploader_id,
            title: 'Video Rejected ❌',
            message: `Your video "${video.title}" was not approved to be published.`,
        });

    if (notifErr) console.error('Failed to send rejection notification:', notifErr.message);
}

export async function deleteVideo(videoId: string) {
    // Ideally, we fetch the video to get its file paths and delete from storage first.
    const { data: video, error: fetchError } = await supabase
        .from('videos')
        .select('*')
        .eq('id', videoId)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        throw new Error(`Failed to fetch video details: ${fetchError.message}`);
    }

    if (video) {
        // Try to delete thumbnail
        if (video.thumbnail_url) {
            const thumbMatch = video.thumbnail_url.split('/public/thumbnails/');
            if (thumbMatch[1]) {
                await supabase.storage.from('thumbnails').remove([thumbMatch[1]]);
            }
        }
        // Try to delete video file
        if (video.video_url) {
            const videoMatch = video.video_url.split('/public/videos/');
            if (videoMatch[1]) {
                await supabase.storage.from('videos').remove([videoMatch[1]]);
            }
        }
    }

    // Now delete DB row
    const { error } = await supabase
        .from('videos')
        .delete()
        .eq('id', videoId);

    if (error) throw new Error(`Failed to delete video: ${error.message}`);
}

// --- 5. GET MY VIDEOS (CREATOR) ---
export async function getMyVideos(userId: string): Promise<Video[]> {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('*')
            .eq('created_by', userId);

        if (error) {
            console.error("Fetch my videos error:", error.message);
            return [];
        }
        // Map database view_count to views for frontend compatibility
        return (data || []).map((video: any) => ({
            ...video,
            views: video.view_count || 0,
        })) as Video[];
    } catch (e) {
        console.error("Fetch my videos error:", e);
        return [];
    }
}

// --- 6. SEARCH ---
export async function searchVideos(query: string): Promise<Video[]> {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('*')
            .eq('status', 'approved')
            .ilike('title', `%${query}%`); // Supabase parameterizes this safely

        if (error) {
            console.error("Search error:", error.message);
            return [];
        }
        return (data || []) as Video[];
    } catch (e) {
        console.error("Search error:", e);
        return [];
    }
}

// --- 7. INCREMENT VIEWS ---
export async function incrementView(videoId: string): Promise<void> {
    try {
        // Use RPC if available for atomic increment, otherwise read-update (optimistic)
        // Ideally: await supabase.rpc('increment_view_count', { video_id: videoId });

        // Fallback to read-then-update pattern from previous code
        const { data: current } = await supabase
            .from('videos')
            .select('view_count')
            .eq('id', videoId)
            .single();

        const newViews = (current?.view_count || 0) + 1;

        await supabase
            .from('videos')
            .update({ view_count: newViews })
            .eq('id', videoId);

    } catch (e) {
        console.error("View increment failed:", e);
    }
}

// --- 8. AD MANAGEMENT (ADMIN) ---

export async function uploadAd(title: string, type: 'video' | 'banner', file: File) {
    const timestamp = Date.now();
    const bucket = type === 'video' ? 'ads_videos' : 'ads_banners';
    const path = `${timestamp}_${file.name.replace(/\s+/g, '_')}`;

    const url = await uploadFileToStorage(bucket, path, file);
    if (!url) throw new Error("Failed to upload ad file");

    const { data, error } = await supabase
        .from('ads')
        .insert({ title, type, url })
        .select()
        .single();

    if (error) throw new Error(`Failed to save ad metadata: ${error.message}`);
    return data;
}

export async function getAds(type?: 'video' | 'banner'): Promise<Ad[]> {
    try {
        let query = supabase.from('ads').select('*');
        if (type) {
            query = query.eq('type', type);
        }
        const { data, error } = await query;

        if (error) {
            console.error("Fetch ads error:", error.message);
            return [];
        }
        return (data || []) as Ad[];
    } catch (e) {
        console.error("Fetch ads error:", e);
        return [];
    }
}

export async function deleteAd(adId: string): Promise<void> {
    const { error } = await supabase
        .from('ads')
        .delete()
        .eq('id', adId);
    if (error) throw new Error(`Failed to delete ad: ${error.message}`);
}

/** Fetch banner ads assigned to a global site slot, ordered by slot number */
export async function getGlobalBannerAds(): Promise<Ad[]> {
    try {
        const { data, error } = await supabase
            .from('ads')
            .select('*')
            .eq('type', 'banner')
            .not('global_slot', 'is', null)
            .order('global_slot', { ascending: true })
            .limit(4);
        if (error) { console.error('getGlobalBannerAds:', error.message); return []; }
        return (data || []) as Ad[];
    } catch (e) {
        console.error('getGlobalBannerAds:', e);
        return [];
    }
}

/** Assign (or clear) a global banner slot for an ad.
 *  slot = 1-4 to assign, null to remove from global rotation. */
export async function setAdGlobalSlot(adId: string, slot: number | null): Promise<void> {
    // Clear any existing ad occupying the same slot first
    if (slot !== null) {
        await supabase
            .from('ads')
            .update({ global_slot: null })
            .eq('global_slot', slot)
            .neq('id', adId);
    }
    const { error } = await supabase
        .from('ads')
        .update({ global_slot: slot })
        .eq('id', adId);
    if (error) throw new Error(`Failed to set global slot: ${error.message}`);
}

export async function assignAdsToVideo(
    videoId: string,
    ads: {
        preroll1?: string | null;
        preroll2?: string | null;
        banner1?: string | null;
        banner2?: string | null;
    }
) {
    const { data, error } = await supabase
        .from('videos')
        .update({
            preroll_ad_id: ads.preroll1 ?? null,
            preroll_ad_id_2: ads.preroll2 ?? null,
            banner_ad_id_1: ads.banner1 ?? null,
            banner_ad_id_2: ads.banner2 ?? null,
        })
        .eq('id', videoId)
        .select();

    if (error) throw new Error(`Failed to assign ads: ${error.message}`);
    return data;
}

export async function toggleVideoAds(videoId: string, enabled: boolean) {
    const { data, error } = await supabase
        .from('videos')
        .update({ ads_enabled: enabled })
        .eq('id', videoId)
        .select();

    if (error) throw new Error("Failed to toggle ads");
    return data;
}

export async function getAdById(adId: string): Promise<Ad | null> {
    try {
        const { data, error } = await supabase
            .from('ads')
            .select('*')
            .eq('id', adId)
            .single();

        if (error) {
            console.error("Fetch ad error:", error.message);
            return null;
        }
        return data as Ad;
    } catch (e) {
        console.error("Fetch ad error:", e);
        return null;
    }
}

// --- 9. PREMIUM / TIER UPDATE (Using Secure RPC) ---
export async function updateUserTier(userId: string, tier: 'free' | 'premium') {
    console.log(`Calling RPC to upgrade user ${userId} to ${tier}...`);

    // Use the secure server function we created in Supabase
    // Note: ensure 'upgrade_to_premium' RPC exists in your Supabase DB
    const { error } = await supabase.rpc('upgrade_to_premium', {
        target_user_id: userId
    });

    if (error) {
        console.error("RPC Error:", error);
        throw error;
    }

    console.log("Upgrade successful!");
}

// --- 10. WATCH LATER / MY LIST ---
export async function addToWatchLater(userId: string, videoId: string): Promise<void> {
    const { error } = await supabase
        .from('watch_later')
        .insert([{ user_id: userId, video_id: videoId }]);
    if (error) throw error;
}

export async function removeFromWatchLater(userId: string, videoId: string): Promise<void> {
    const { error } = await supabase
        .from('watch_later')
        .delete()
        .eq('user_id', userId)
        .eq('video_id', videoId);
    if (error) throw error;
}

export async function getWatchLater(userId: string): Promise<Video[]> {
    const { data, error } = await supabase
        .from('watch_later')
        .select(`
            video_id,
            videos (*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching watch later:", error.message);
        return [];
    }

    // Transform joined data back to Video[]
    return (data || [])
        .map((item: any) => {
            const video = Array.isArray(item.videos) ? item.videos[0] : item.videos;
            return video;
        })
        .filter(Boolean) as Video[];
}

export async function checkInWatchLater(userId: string, videoId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('watch_later')
        .select('video_id')
        .eq('user_id', userId)
        .eq('video_id', videoId)
        .single();

    if (error && error.code !== 'PGRST116') {
        console.error("Error checking watch later:", error.message);
        return false; // PGRST116 is "No rows found"
    }
    return !!data;
}

// --- 11. WATCH HISTORY ---
export async function addToHistory(userId: string, videoId: string): Promise<void> {
    // This will upsert (update if exists, insert if not) because we defined ON CONFLICT in SQL
    const { error } = await supabase
        .from('watch_history')
        .upsert([{ user_id: userId, video_id: videoId, last_watched_at: new Date().toISOString() }], { onConflict: 'user_id, video_id' });

    if (error) console.error("Error saving history:", error.message);
}

export async function getWatchHistory(userId: string): Promise<Video[]> {
    const { data, error } = await supabase
        .from('watch_history')
        .select(`
            video_id,
            videos (*)
        `)
        .eq('user_id', userId)
        .order('last_watched_at', { ascending: false })
        .limit(20); // Limit to last 20 videos

    if (error) {
        console.error("Error fetching history:", error.message);
        return [];
    }

    return (data || [])
        .map((item: any) => {
            const video = Array.isArray(item.videos) ? item.videos[0] : item.videos;
            return video;
        })
        .filter(Boolean) as Video[];
}

// --- 12. ACCOUNT DELETION ---
export async function deleteMyAccount() {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw error;
}

// --- 13. CONTENT DISCOVERY - RECOMMENDATIONS ---
export async function getRecommendations(userId: string): Promise<Video[]> {
    try {
        // Get user's watch history to find preferred categories
        const { data: watchHistory, error: historyError } = await supabase
            .from('watch_history')
            .select('videos(category_id)')
            .eq('user_id', userId)
            .limit(10);

        if (historyError) {
            console.error("Error fetching watch history:", historyError.message);
            return [];
        }

        // Extract category IDs from watch history
        const watchedCategoryIds = new Set(
            (watchHistory || [])
                .map((item: any) => {
                    const video = Array.isArray(item.videos) ? item.videos[0] : item.videos;
                    return video?.category_id;
                })
                .filter(Boolean)
        );

        // If no history, return trending videos (highest views)
        if (watchedCategoryIds.size === 0) {
            const { data, error } = await supabase
                .from('videos')
                .select('*, category:categories(name)')
                .eq('status', 'approved')
                .order('view_count', { ascending: false })
                .limit(8);

            if (error) {
                console.error("Error fetching trending videos:", error.message);
                return [];
            }

            return (data || []).map((video: any) => ({
                ...video,
                category: video.category?.name || 'Other',
                views: video.view_count || 0,
            })) as Video[];
        }

        // Get videos matching user's preferred categories (excluding watched)
        const categoryIdArray = Array.from(watchedCategoryIds) as number[];
        const { data: watchedVideoIds, error: watchedError } = await supabase
            .from('watch_history')
            .select('video_id')
            .eq('user_id', userId);

        if (watchedError) console.error("Error fetching watched videos:", watchedError.message);

        const watchedIds = new Set((watchedVideoIds || []).map((item: any) => item.video_id));

        const { data, error } = await supabase
            .from('videos')
            .select('*, category:categories(name)')
            .eq('status', 'approved')
            .in('category_id', categoryIdArray)
            .order('view_count', { ascending: false })
            .limit(12); // Get extra to account for filtering

        if (error) {
            console.error("Error fetching recommendations:", error.message);
            return [];
        }

        // Filter out already watched videos and return top 8
        return (data || [])
            .filter((video) => !watchedIds.has(video.id))
            .slice(0, 8)
            .map((video: any) => ({
                ...video,
                category: video.category?.name || 'Other',
                views: video.view_count || 0,
            })) as Video[];
    } catch (e) {
        console.error("Error getting recommendations:", e);
        return [];
    }
}

// --- 14. CATEGORY MANAGEMENT (ADMIN) ---

export interface Category {
    id: string;
    name: string;
    description?: string | null;
    created_at?: string;
}

export async function getCategories(): Promise<Category[]> {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('Fetch categories error:', error.message);
            return [];
        }
        return (data || []) as Category[];
    } catch (e) {
        console.error('Fetch categories error:', e);
        return [];
    }
}

export async function createCategory(name: string, description?: string): Promise<Category> {
    const payload: { name: string; description?: string } = { name: name.trim() };
    if (description?.trim()) payload.description = description.trim();

    const { data, error } = await supabase
        .from('categories')
        .insert(payload)
        .select()
        .single();

    if (error) throw new Error(`Failed to create category: ${error.message}`);
    return data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
    const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

    if (error) throw new Error(`Failed to delete category: ${error.message}`);
}

/**
 * Deletes a category only if it exists.
 * Returns true if deleted, false if it was already gone.
 * Never throws on a "not found" condition — safe to call idempotently.
 */
export async function deleteCategoryIfExists(id: string): Promise<boolean> {
    // First check if the row exists
    const { data, error: fetchError } = await supabase
        .from('categories')
        .select('id')
        .eq('id', id)
        .single();

    // PGRST116 = "no rows returned" — already doesn't exist, nothing to do
    if (fetchError) {
        if (fetchError.code === 'PGRST116') return false;
        throw new Error(`Failed to look up category: ${fetchError.message}`);
    }

    if (!data) return false; // extra guard

    // Row exists — delete it
    const { error: deleteError } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

    if (deleteError) throw new Error(`Failed to delete category: ${deleteError.message}`);
    return true;
}

// ─────────────────────────────────────────────────────────────
// --- 15. NOTIFICATIONS ---
// ─────────────────────────────────────────────────────────────

export interface Notification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    is_read: boolean;
    created_at: string;
}

/** Fetch all notifications for the current user, newest first. */
export async function getUserNotifications(userId: string): Promise<Notification[]> {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);

    if (error) {
        console.error('Error fetching notifications:', error.message);
        return [];
    }
    return (data || []) as Notification[];
}

/** Mark a single notification as read. */
export async function markNotificationRead(notificationId: string): Promise<void> {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

    if (error) throw new Error(`Failed to mark notification read: ${error.message}`);
}

/** Mark ALL unread notifications for a user as read. */
export async function markAllNotificationsRead(userId: string): Promise<void> {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

    if (error) throw new Error(`Failed to mark all notifications read: ${error.message}`);
}
