import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/failure-log
//   결제 실패를 사유(category)/에러코드별로 적재하는 모니터링 엔드포인트 (4순위).
//   클라이언트는 navigator.sendBeacon 또는 fetch(keepalive)로 fire-and-forget 전송.
//   적재 실패는 사용자 결제 흐름에 영향을 주지 않으므로 항상 2xx 로 응답한다.
//
// GET /api/payments/failure-log?days=30
//   사유별 집계 요약 반환. Authorization: Bearer <SERVICE_ROLE_KEY> 필요(관리자/크론).
// ─────────────────────────────────────────────────────────────────────────────

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return createClient(url, anonKey);
}

const ALLOWED_CATEGORIES = ['not_approved', 'instrument_declined', 'user_cancel', 'generic'];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const category = ALLOWED_CATEGORIES.includes(body.category) ? body.category : 'generic';
    const provider = typeof body.provider === 'string' ? body.provider.slice(0, 40) : 'paypal';

    // KRW 정수 금액만 허용
    const amountKrw =
      typeof body.amount === 'number' && Number.isFinite(body.amount)
        ? Math.round(body.amount)
        : null;

    const truncate = (v: unknown, n: number) =>
      typeof v === 'string' ? v.slice(0, n) : null;

    const supabase = createAdminClient();
    const { error } = await supabase.from('payment_failure_logs').insert({
      provider,
      category,
      code: truncate(body.code, 120),
      raw_message: truncate(body.rawMessage, 2000),
      payment_id: truncate(body.paymentId, 120),
      order_id: truncate(body.orderId, 120),
      amount_krw: amountKrw,
      path: truncate(body.path, 300),
      user_agent: truncate(body.userAgent, 500),
    });

    if (error) {
      // 적재 실패해도 사용자 흐름에 영향 X — 로그만 남기고 성공 응답
      console.warn('[failure-log] insert 실패(무시):', error.message);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.warn('[failure-log] 처리 예외(무시):', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}

export async function GET(request: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authHeader = request.headers.get('authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!serviceRoleKey || bearer !== serviceRoleKey) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const days = Math.min(Math.max(Number(new URL(request.url).searchParams.get('days') ?? 30), 1), 180);
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('payment_failure_logs')
    .select('provider, category')
    .gte('created_at', sinceIso);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const summary: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = `${row.provider}:${row.category}`;
    summary[key] = (summary[key] ?? 0) + 1;
  }

  return NextResponse.json({
    success: true,
    days,
    total: data?.length ?? 0,
    byProviderCategory: summary,
  });
}
