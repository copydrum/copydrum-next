import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MarketingSetting {
    id: string;
    platform: string;
    is_enabled: boolean;
    daily_limit: number;
    credentials: Record<string, any>;
    created_at: string;
    updated_at: string;
}

interface DrumSheet {
    id: string;
    title: string;
    artist: string;
    preview_image_url: string;
    pdf_url: string;
    youtube_url: string;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Authentication & Authorization
        const authHeader = req.headers.get('Authorization');
        let triggeredBy = 'unknown';

        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

            if (!authError && user) {
                // Check if user is admin
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (profile?.role === 'admin') {
                    triggeredBy = `admin:${user.email}`;
                } else {
                    // Allow service role (e.g. cron)
                    // Note: getUser with service role key returns the user if a valid user token is passed,
                    // but if the token IS the service role key, getUser might behave differently or we check the key directly.
                    // For simplicity, we assume if it's not a user token, it might be a service call, 
                    // but strictly speaking we should check if the JWT role is 'service_role'.
                    const jwtPayload = JSON.parse(atob(token.split('.')[1]));
                    if (jwtPayload.role === 'service_role') {
                        triggeredBy = 'system:cron';
                    } else {
                        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
                    }
                }
            } else {
                // If getUser fails, check if it's the service role key directly (simple check)
                if (token === supabaseServiceKey) {
                    triggeredBy = 'system:cron';
                } else {
                    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
                }
            }
        } else {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: corsHeaders });
        }

        console.log(`Marketing automation triggered by ${triggeredBy}`);

        // 2. Fetch Settings
        const { data: settings, error: settingsError } = await supabaseAdmin
            .from('marketing_settings')
            .select('*')
            .eq('is_enabled', true);

        if (settingsError) {
            throw new Error(`Failed to fetch settings: ${settingsError.message}`);
        }

        if (!settings || settings.length === 0) {
            return new Response(JSON.stringify({ message: 'No active marketing platforms found.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const results = [];

        // 3. Process each platform
        for (const setting of settings) {
            const platform = setting.platform;
            const limit = setting.daily_limit;
            const credentials = setting.credentials;

            console.log(`Processing platform: ${platform}`);

            // Check today's post count
            const today = new Date().toISOString().split('T')[0];
            const { count: todayCount, error: countError } = await supabaseAdmin
                .from('marketing_posts')
                .select('*', { count: 'exact', head: true })
                .eq('platform', platform)
                .eq('status', 'success')
                .gte('posted_at', `${today}T00:00:00.000Z`)
                .lte('posted_at', `${today}T23:59:59.999Z`);

            if (countError) {
                console.error(`Failed to count posts for ${platform}:`, countError);
                continue;
            }

            const remainingQuota = limit - (todayCount || 0);
            if (remainingQuota <= 0) {
                results.push({ platform, status: 'skipped', reason: 'Daily limit reached' });
                continue;
            }

            // Fetch unposted sheets
            // We need sheets that are NOT in marketing_posts for this platform
            // Supabase doesn't support "NOT IN" with subquery easily in JS client, so we might need a stored procedure or fetch IDs.
            // For simplicity/performance with small dataset, we can fetch posted IDs first.

            const { data: postedSheets } = await supabaseAdmin
                .from('marketing_posts')
                .select('sheet_id')
                .eq('platform', platform);

            const postedSheetIds = postedSheets?.map(p => p.sheet_id) || [];

            // Fetch candidate sheets (limit to remainingQuota + buffer)
            let query = supabaseAdmin
                .from('drum_sheets')
                .select('id, title, artist, preview_image_url, pdf_url, youtube_url')
                .limit(remainingQuota);

            if (postedSheetIds.length > 0) {
                query = query.not('id', 'in', `(${postedSheetIds.join(',')})`);
            }

            const { data: candidates, error: candidatesError } = await query;

            if (candidatesError) {
                console.error(`Failed to fetch candidates for ${platform}:`, candidatesError);
                continue;
            }

            if (!candidates || candidates.length === 0) {
                results.push({ platform, status: 'skipped', reason: 'No new sheets to post' });
                continue;
            }

            // Post each candidate
            for (const sheet of candidates) {
                let postResult;
                try {
                    if (platform === 'tistory') {
                        postResult = await postToTistory(sheet, credentials);
                    } else if (platform === 'pinterest') {
                        postResult = await postToPinterest(sheet, credentials);
                    } else {
                        throw new Error(`Unknown platform: ${platform}`);
                    }

                    // Log success
                    await supabaseAdmin.from('marketing_posts').insert({
                        platform,
                        sheet_id: sheet.id,
                        status: 'success',
                        post_url: postResult.url,
                        posted_at: new Date().toISOString(),
                        error_message: null
                    });

                    results.push({ platform, sheet: sheet.title, status: 'success', url: postResult.url });

                } catch (error: any) {
                    console.error(`Failed to post ${sheet.title} to ${platform}:`, error);

                    // Log failure
                    await supabaseAdmin.from('marketing_posts').insert({
                        platform,
                        sheet_id: sheet.id,
                        status: 'failed',
                        post_url: null,
                        posted_at: new Date().toISOString(),
                        error_message: error.message || 'Unknown error'
                    });

                    results.push({ platform, sheet: sheet.title, status: 'failed', error: error.message });
                }
            }
        }

        return new Response(JSON.stringify({ success: true, results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Marketing automation error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});

// --- Platform Specific Implementations ---

async function postToTistory(sheet: DrumSheet, credentials: any) {
    const { access_token, blog_name } = credentials;
    if (!access_token || !blog_name) {
        throw new Error('Missing Tistory credentials (access_token or blog_name)');
    }

    // Construct Content
    const title = `[드럼악보] ${sheet.title} - ${sheet.artist}`;
    const content = `
    <p>안녕하세요! CopyDrum입니다.</p>
    <p>오늘 소개해드릴 드럼 악보는 <strong>${sheet.artist}</strong>의 <strong>${sheet.title}</strong>입니다.</p>
    <br/>
    ${sheet.preview_image_url ? `<img src="${sheet.preview_image_url}" alt="${sheet.title} 드럼 악보 미리보기" style="max-width: 100%;" />` : ''}
    <br/>
    <p>이 악보는 CopyDrum에서 구매하실 수 있습니다.</p>
    <p><a href="https://copydrum.com/sheet-detail/${sheet.id}" target="_blank" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">악보 보러가기</a></p>
    <br/>
    ${sheet.youtube_url ? `<p>관련 영상: <a href="${sheet.youtube_url}">${sheet.youtube_url}</a></p>` : ''}
  `;

    // Tistory API endpoint
    const url = 'https://www.tistory.com/apis/post/write';
    const params = new URLSearchParams();
    params.append('access_token', access_token);
    params.append('output', 'json');
    params.append('blogName', blog_name);
    params.append('title', title);
    params.append('content', content);
    params.append('visibility', '3'); // 3: Public

    const response = await fetch(url, {
        method: 'POST',
        body: params,
    });

    const data = await response.json();

    if (response.ok && data.tistory?.status === '200') {
        return { url: data.tistory.url };
    } else {
        throw new Error(`Tistory API Error: ${JSON.stringify(data)}`);
    }
}

async function postToPinterest(sheet: DrumSheet, credentials: any) {
    const { access_token, board_id } = credentials;
    if (!access_token || !board_id) {
        throw new Error('Missing Pinterest credentials (access_token or board_id)');
    }

    const title = `${sheet.title} - ${sheet.artist} Drum Sheet Music`;
    const description = `Get the drum sheet music for ${sheet.title} by ${sheet.artist} at CopyDrum! High quality, accurate transcription.`;
    const link = `https://copydrum.com/sheet-detail/${sheet.id}`;
    const imageUrl = sheet.preview_image_url || 'https://copydrum.com/default-sheet-preview.png'; // Fallback

    const url = 'https://api.pinterest.com/v5/pins';
    const body = {
        board_id: board_id,
        media_source: {
            source_type: 'image_url',
            url: imageUrl,
        },
        title: title,
        description: description,
        link: link,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json();

    if (response.ok) {
        // Pinterest returns the created pin object. We can construct the URL.
        // data.id is the pin ID.
        return { url: `https://www.pinterest.com/pin/${data.id}/` };
    } else {
        throw new Error(`Pinterest API Error: ${JSON.stringify(data)}`);
    }
}
