import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }
  return createClient(url, anonKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sheetId, userId, sessionId, referrer, pageUrl, userAgent, downloadSource, country } = body;

    if (!sheetId) {
      return NextResponse.json(
        { success: false, error: 'sheetId가 누락되었습니다.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // IP 해싱 (개인정보 보호를 위해 원본 IP 대신 해시 저장)
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    // 간단한 해시: 원본 IP를 저장하지 않고 식별만 가능하게
    const ipHash = await hashString(ip);

    const { error } = await supabase
      .from('free_sheet_downloads')
      .insert({
        sheet_id: sheetId,
        user_id: userId || null,
        session_id: sessionId || null,
        ip_hash: ipHash,
        country: country || null,
        referrer: referrer || null,
        page_url: pageUrl || null,
        user_agent: userAgent || null,
        download_source: downloadSource || 'free-sheets-page',
      });

    if (error) {
      console.error('[log-download] ❌ 다운로드 로그 저장 실패:', error);
      return NextResponse.json(
        { success: false, error: '다운로드 로그 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[log-download] 🔥 예외 발생:', error);
    return NextResponse.json(
      {
        success: false,
        error: '다운로드 로그 기록 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// 간단한 문자열 해싱 (개인정보 보호)
async function hashString(str: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str + '_copydrum_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  }
  // fallback: 단순 해시
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}
