import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ─── Server-side only: credentials never reach the browser bundle ─────────────
const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
    },
});

const BUCKET = process.env.VITE_R2_BUCKET_NAME as string;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Only allow POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { fileName, fileType, userId } = req.body ?? {};

    if (!fileName || !fileType || !userId) {
        return res.status(400).json({ error: 'Missing required fields: fileName, fileType, userId' });
    }

    // Sanitise the original filename (strip spaces / special chars)
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = safeName.split('.').pop() ?? 'bin';

    // Scoped, collision-free key: userId/timestamp_random.ext
    const fileKey = `${userId}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;

    const command = new PutObjectCommand({
        Bucket: BUCKET,
        Key: fileKey,
        ContentType: String(fileType),
    });

    try {
        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour

        return res.status(200).json({ uploadUrl, fileKey });
    } catch (err: any) {
        console.error('[get-upload-url] presign error:', err);
        return res.status(500).json({ error: 'Failed to generate upload URL', detail: err.message });
    }
}
