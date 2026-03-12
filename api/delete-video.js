import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

// ─── Server-side only: credentials never reach the browser bundle ─────────────

const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// Use the service-role key so we can delete rows regardless of RLS policies
const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET = process.env.VITE_R2_BUCKET_NAME;

export default async function handler(req, res) {
    // Only allow POST (or DELETE — both are fine for this operation)
    if (req.method !== 'POST' && req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId, videoUrl } = req.body ?? {};

    if (!videoId || !videoUrl) {
        return res.status(400).json({ error: 'Missing required fields: videoId, videoUrl' });
    }

    try {
        // 1. Extract the S3 key from the end of the public CDN URL.
        //    The URL looks like: https://<r2-public-domain>/<userId>/<timestamp>_<random>.mp4
        //    We want everything after the last "/" — but for R2 the key is the full path
        //    after the bucket root, so we parse it from the URL pathname instead.
        const urlObj = new URL(videoUrl);
        // pathname starts with "/" — remove it to get the bare key
        const fileKey = urlObj.pathname.replace(/^\//, '');

        if (!fileKey) {
            return res.status(400).json({ error: 'Could not extract file key from videoUrl' });
        }

        // 2. Delete the .mp4 object from Cloudflare R2
        await s3.send(
            new DeleteObjectCommand({
                Bucket: BUCKET,
                Key: fileKey,
            })
        );

        // 3. Delete the corresponding row from Supabase (uses service-role key → bypasses RLS)
        const { error: dbError } = await supabase
            .from('videos')
            .delete()
            .eq('id', videoId);

        if (dbError) {
            throw new Error(`Supabase delete failed: ${dbError.message}`);
        }

        // 4. All good
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('[delete-video] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
