/**
 * Supabase Edge Function: send-notification-email
 *
 * Called by api.ts (approveVideo / rejectVideo) after inserting a notification.
 * Uses Supabase Admin SDK to look up the user's email, then sends via Resend.
 *
 * Deploy with:
 *   supabase functions deploy send-notification-email --no-verify-jwt
 *
 * Required Edge Function secrets (set via Supabase Dashboard → Settings → Edge Functions):
 *   RESEND_API_KEY   — get a free key at https://resend.com
 *   FROM_EMAIL       — e.g. noreply@evano.app  (must be a verified domain in Resend)
 *   SUPABASE_URL     — auto-available in Edge Functions
 *   SUPABASE_SERVICE_ROLE_KEY — add this as a secret for admin lookups
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { userId, title, message } = await req.json() as {
            userId: string;
            title: string;
            message: string;
        };

        if (!userId || !title || !message) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: userId, title, message' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ── 1. Look up the user's email using the Admin client ──────────────
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

        if (userError || !user?.email) {
            console.error('Failed to fetch user email:', userError?.message);
            return new Response(
                JSON.stringify({ error: 'Could not resolve user email' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const toEmail = user.email;
        const fromEmail = Deno.env.get('FROM_EMAIL') ?? 'noreply@evano.app';
        const resendApiKey = Deno.env.get('RESEND_API_KEY');

        if (!resendApiKey) {
            console.error('RESEND_API_KEY not set');
            return new Response(
                JSON.stringify({ error: 'Email service not configured' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // ── 2. Send email via Resend ─────────────────────────────────────────
        const isApproval = title.toLowerCase().includes('approved');
        const accentColor = isApproval ? '#22C55E' : '#ff4d4f';
        const icon = isApproval ? '✅' : '❌';

        const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#0B0F19;font-family:Inter,system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F19;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#1A1F2E;border-radius:16px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;max-width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#14532d,#22C55E);padding:24px 32px;text-align:center;">
              <span style="font-size:32px;font-weight:900;color:white;letter-spacing:2px;">EVANO</span>
              <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;letter-spacing:1px;">STREAMS</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <p style="font-size:40px;text-align:center;margin:0 0 16px;">${icon}</p>
              <h1 style="color:${accentColor};font-size:22px;font-weight:800;margin:0 0 12px;text-align:center;">${title}</h1>
              <p style="color:#B0B8C1;font-size:15px;line-height:1.6;margin:0 0 28px;text-align:center;">${message}</p>

              <div style="text-align:center;">
                <a href="https://evano-pwa.vercel.app/creator"
                   style="display:inline-block;background:linear-gradient(135deg,#14532d,#22C55E);color:white;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.5px;">
                  Go to Creator Studio →
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
              <p style="color:#555;font-size:12px;margin:0;">
                You received this email because you are a creator on Evano Streams.<br/>
                Log in to your account to manage your videos.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: `Evano Streams <${fromEmail}>`,
                to: [toEmail],
                subject: `${icon} ${title} — Evano Streams`,
                html: htmlBody,
            }),
        });

        if (!emailRes.ok) {
            const err = await emailRes.text();
            console.error('Resend API error:', err);
            return new Response(
                JSON.stringify({ error: 'Failed to send email', detail: err }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const result = await emailRes.json();
        console.log('Email sent successfully:', result.id);

        return new Response(
            JSON.stringify({ success: true, emailId: result.id }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (err) {
        console.error('Unexpected error:', err);
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
