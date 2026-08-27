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
    preview_image_url: string | null;
    youtube_url: string | null;
    slug: string | null;
}

const SITE_URL = 'https://www.copydrum.com';

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
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (profile?.role === 'admin') {
                    triggeredBy = `admin:${user.email}`;
                } else {
                    try {
                        const jwtPayload = JSON.parse(atob(token.split('.')[1]));
                        if (jwtPayload.role === 'service_role') {
                            triggeredBy = 'system:cron';
                        } else {
                            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
                        }
                    } catch {
                        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
                    }
                }
            } else {
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

        // 2. Fetch Settings — 서버 자동 발행은 Pinterest만 지원
        // 네이버/티스토리/구글: tools/blog-autopost CLI 사용
        // (티스토리 Open API 종료, 네이버 글쓰기 API 종료)
        const { data: settings, error: settingsError } = await supabaseAdmin
            .from('marketing_settings')
            .select('*')
            .eq('is_enabled', true)
            .eq('platform', 'pinterest');

        if (settingsError) {
            throw new Error(`Failed to fetch settings: ${settingsError.message}`);
        }

        if (!settings || settings.length === 0) {
            return new Response(JSON.stringify({
                message: 'No active Pinterest marketing settings. Use tools/blog-autopost for Naver/Tistory/Google.',
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const results = [];

        for (const setting of settings as MarketingSetting[]) {
            const platform = setting.platform;
            const limit = setting.daily_limit;
            const credentials = setting.credentials;

            console.log(`Processing platform: ${platform}`);

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

            const { data: postedSheets } = await supabaseAdmin
                .from('marketing_posts')
                .select('sheet_id')
                .eq('platform', platform)
                .in('status', ['success', 'manual_copy', 'skipped']);

            const postedSheetIds = postedSheets?.map(p => p.sheet_id) || [];

            let query = supabaseAdmin
                .from('drum_sheets')
                .select('id, title, artist, preview_image_url, youtube_url, slug')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
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

            for (const sheet of candidates as DrumSheet[]) {
                try {
                    const postResult = await postToPinterest(sheet, credentials);

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

function sheetUrl(sheet: DrumSheet): string {
    const key = sheet.slug || sheet.id;
    return `${SITE_URL}/en/drum-sheet/${key}`;
}

async function postToPinterest(sheet: DrumSheet, credentials: any) {
    const { access_token, board_id } = credentials;
    if (!access_token || !board_id) {
        throw new Error('Missing Pinterest credentials (access_token or board_id)');
    }

    const title = `${sheet.title} - ${sheet.artist} Drum Sheet Music`;
    const link = sheetUrl(sheet);
    const description = `Get the drum sheet music for ${sheet.title} by ${sheet.artist} at CopyDrum! High quality, accurate transcription. ${link}`;
    const imageUrl = sheet.preview_image_url || `${SITE_URL}/default-sheet-preview.png`;

    const url = 'https://api.pinterest.com/v5/pins';
    const body = {
        board_id: board_id,
        media_source: {
            source_type: 'image_url',
            url: imageUrl,
        },
        title: title.slice(0, 100),
        description: description.slice(0, 800),
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
        return { url: `https://www.pinterest.com/pin/${data.id}/` };
    } else {
        throw new Error(`Pinterest API Error: ${JSON.stringify(data)}`);
    }
}
