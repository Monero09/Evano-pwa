
export interface Ad {
    id: string;
    title: string;
    type: 'video' | 'banner';
    url: string;
    created_at: string;
    global_slot?: number | null; // 1-4: assigned global site banner slot
}

export interface Video {
    id: string;
    title: string;
    description: string;
    video_url: string;
    thumbnail_url: string;
    category: string; // We'll map category_id to category for display
    category_id?: number;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    view_count?: number; // Changed from 'views' to match DB
    views?: number; // Keep for backward compatibility
    created_by?: string;
    uploader_id?: string;
    ads_enabled?: boolean;
    preroll_ad_id?: string | null;
    preroll_ad_id_2?: string | null;
    banner_ad_id_1?: string | null;
    banner_ad_id_2?: string | null;
    duration_seconds?: number | null;
    resolution?: string;
    is_featured?: boolean;
}

export interface VideoUploadData {
    title: string;
    description: string;
    category: string;
    videoFile: File;
    thumbnailFile: File;
}
