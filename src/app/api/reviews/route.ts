import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';

const PURCHASE_VALID_STATUSES = ['payment_confirmed', 'completed'];

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, serviceRoleKey || anonKey);
}

function maskName(name?: string | null, email?: string | null): string {
  const base = (name && name.trim()) || (email ? email.split('@')[0] : '');
  if (!base) return 'Anonymous';
  // 이름 마지막 글자 마스킹 (개인정보 최소 노출)
  if (base.length <= 2) return base[0] + '*';
  return base.slice(0, base.length - 1) + '*';
}

/**
 * GET /api/reviews?sheetId=...&limit=20&offset=0
 * 특정 악보의 리뷰 목록 + 통계(평균/개수)를 반환. 인증 불필요(공개).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sheetId = searchParams.get('sheetId');
  if (!sheetId) {
    return NextResponse.json({ success: false, error: 'sheetId is required' }, { status: 400 });
  }

  const limit = Math.min(Number(searchParams.get('limit')) || 20, 50);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  const supabase = createAdminClient();

  const [{ data: reviews, error: listErr }, { data: stats }] = await Promise.all([
    supabase
      .from('reviews')
      .select('id, user_id, rating, comment, user_name, created_at, updated_at')
      .eq('sheet_id', sheetId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from('drum_sheet_review_stats')
      .select('review_count, avg_rating')
      .eq('sheet_id', sheetId)
      .maybeSingle(),
  ]);

  if (listErr) {
    return NextResponse.json({ success: false, error: listErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    reviews: reviews ?? [],
    stats: {
      reviewCount: stats?.review_count ?? 0,
      avgRating: stats?.avg_rating ? Number(stats.avg_rating) : 0,
    },
  });
}

/**
 * POST /api/reviews
 * body: { sheetId, rating(1~5), comment? }
 * 세션 인증 + 구매 검증 후 upsert(작성/수정).
 */
export async function POST(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { sheetId?: string; rating?: number; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const sheetId = body.sheetId?.trim();
  const rating = Math.round(Number(body.rating));
  const comment = (body.comment ?? '').toString().trim().slice(0, 2000);

  if (!sheetId) {
    return NextResponse.json({ success: false, error: 'sheetId is required' }, { status: 400 });
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ success: false, error: '별점은 1~5 사이여야 합니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 🔒 구매 검증 — 해당 악보를 실제 구매(결제 완료)한 사용자만 작성 가능
  const { data: purchase, error: purchaseErr } = await supabase
    .from('order_items')
    .select('drum_sheet_id, orders!inner(status, user_id)')
    .eq('drum_sheet_id', sheetId)
    .eq('orders.user_id', authUser.id)
    .in('orders.status', PURCHASE_VALID_STATUSES)
    .limit(1)
    .maybeSingle();

  if (purchaseErr) {
    return NextResponse.json({ success: false, error: purchaseErr.message }, { status: 500 });
  }
  if (!purchase) {
    return NextResponse.json(
      { success: false, error: '구매한 악보에만 리뷰를 작성할 수 있습니다.' },
      { status: 403 }
    );
  }

  // 표시 이름 스냅샷
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', authUser.id)
    .maybeSingle();
  const userName = maskName(profile?.name, profile?.email ?? authUser.email);

  const { data: saved, error: upsertErr } = await supabase
    .from('reviews')
    .upsert(
      {
        sheet_id: sheetId,
        user_id: authUser.id,
        rating,
        comment: comment || null,
        user_name: userName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,sheet_id' }
    )
    .select('id, rating, comment, user_name, created_at, updated_at')
    .single();

  if (upsertErr) {
    return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, review: saved });
}

/**
 * DELETE /api/reviews?sheetId=...
 * 본인 리뷰 삭제.
 */
export async function DELETE(request: NextRequest) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sheetId = searchParams.get('sheetId');
  if (!sheetId) {
    return NextResponse.json({ success: false, error: 'sheetId is required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('sheet_id', sheetId)
    .eq('user_id', authUser.id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
