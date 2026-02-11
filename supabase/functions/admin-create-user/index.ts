import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Missing service configuration' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace('Bearer ', '');

    // 클라이언트 토큰으로 현재 사용자 조회
    const authClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } }
    });

    const { data: { user }, error: getUserError } = await authClient.auth.getUser();
    if (getUserError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 관리자 권한 확인
    const { data: profile } = await authClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    const users: Array<{ email: string; name: string; kakao_id?: string | null; google_id?: string | null; }>
      = Array.isArray(body?.users) ? body.users : [];

    if (users.length === 0) {
      return new Response(JSON.stringify({ error: 'No users provided' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    const results = { success: [] as string[], failed: [] as { email: string; reason: string }[] };

    for (const u of users) {
      try {
        const email = (u.email || '').trim();
        const name = (u.name || '').trim();
        if (!email || !name) {
          results.failed.push({ email, reason: 'invalid_input' });
          continue;
        }

        // 이미 존재하는지 확인 (profiles 기준)
        const { data: existing } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle();
        if (existing) {
          results.failed.push({ email, reason: 'duplicate' });
          continue;
        }

        // Auth 사용자 생성
        const tempPassword = `Temp!${Date.now()}${Math.random().toString(36).slice(2,7)}`;
        const { data: authRes, error: authErr } = await adminClient.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { name, kakao_id: u.kakao_id || null, google_id: u.google_id || null }
        });
        if (authErr || !authRes?.user) {
          results.failed.push({ email, reason: authErr?.message || 'auth_create_failed' });
          continue;
        }

        // profiles 삽입
        const { error: profileErr } = await adminClient.from('profiles').insert({
          id: authRes.user.id,
          email,
          name,
          kakao_id: u.kakao_id || null,
          google_id: u.google_id || null,
          role: 'user'
        });
        if (profileErr) {
          results.failed.push({ email, reason: 'profile_insert_failed' });
          continue;
        }

        results.success.push(email);
      } catch (e) {
        results.failed.push({ email: u.email, reason: 'unknown' });
      }
    }

    return new Response(JSON.stringify({ ok: true, ...results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});


