import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createSsrServerClient } from '@/lib/supabase/server';
import {
  runDashboardAnalytics,
  type DashboardAnalyticsPeriod,
  type DashboardAnalyticsResult,
} from '@/lib/dashboardAnalytics';

// 어드민 이메일 (admin/page.tsx 와 동일하게 유지)
const ADMIN_EMAILS = ['copydrum@hanmail.net'];

// 모듈 스코프 in-memory 캐시 (period 별로 5분 TTL)
// 서버리스 인스턴스 단위로 동작. 단일 사이트의 어드민 새로고침은
// 같은 인스턴스에 라우팅될 가능성이 높아 cache hit 률이 매우 높음.
type CacheEntry = { data: DashboardAnalyticsResult; expiresAt: number };
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const cache = new Map<DashboardAnalyticsPeriod, CacheEntry>();

const VALID_PERIODS: DashboardAnalyticsPeriod[] = ['daily', 'weekly', 'monthly'];

function buildAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // service role 이 있으면 RLS 우회로 더 빠른 집계, 없으면 anon 으로 fallback
  return createServiceClient(url, serviceRoleKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  try {
    // 1. 어드민 이메일 인증 (쿠키 세션)
    const ssr = await createSsrServerClient();
    const { data: userData } = await ssr.auth.getUser();
    const email = userData?.user?.email ?? null;

    if (!email || !ADMIN_EMAILS.includes(email)) {
      return NextResponse.json(
        { success: false, error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    // 2. 파라미터 검증
    const periodParam = request.nextUrl.searchParams.get('period');
    const force = request.nextUrl.searchParams.get('force') === '1';
    const period = (periodParam ?? 'monthly') as DashboardAnalyticsPeriod;

    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json(
        { success: false, error: `period 는 ${VALID_PERIODS.join('|')} 중 하나여야 합니다.` },
        { status: 400 }
      );
    }

    // 3. 캐시 조회
    const now = Date.now();
    const cached = cache.get(period);
    if (!force && cached && cached.expiresAt > now) {
      return NextResponse.json(
        { success: true, data: cached.data, cached: true, ttlMs: cached.expiresAt - now },
        {
          headers: {
            'Cache-Control': 'private, no-store',
            'X-Cache': 'HIT',
          },
        }
      );
    }

    // 4. 캐시 미스 -> 실제 집계 실행 (service role 클라이언트)
    const client = buildAdminClient();
    const data = await runDashboardAnalytics(client, period);

    cache.set(period, { data, expiresAt: now + CACHE_TTL_MS });

    return NextResponse.json(
      {
        success: true,
        data,
        cached: false,
        elapsedMs: Date.now() - startedAt,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'X-Cache': 'MISS',
        },
      }
    );
  } catch (error) {
    console.error('[dashboard-analytics] error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}

// 캐시 무효화 엔드포인트 (관리자가 수동 새로고침 시 호출 가능)
export async function DELETE(_request: NextRequest) {
  cache.clear();
  return NextResponse.json({ success: true, cleared: true });
}
