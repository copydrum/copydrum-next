import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { PointsError, setOrderPoints } from '@/lib/points/server';

const ERROR_STATUS: Record<string, number> = {
  INSUFFICIENT_POINTS: 400,
  POINTS_EXCEED_TOTAL: 400,
  POINTS_NOT_ALLOWED: 400,
  ORDER_NOT_PENDING: 409,
  ORDER_NOT_FOUND: 404,
  FORBIDDEN: 403,
};

/**
 * 결제 대기 주문에 사용할 포인트를 정한다.
 * body: { points: number }  (0 이면 사용 취소)
 * 응답의 payable 이 PG 에 요청할 금액이다.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const { orderId } = await params;
  let points: number;
  try {
    const body = await request.json();
    points = Math.floor(Number(body?.points));
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 });
  }
  if (!orderId || !Number.isFinite(points) || points < 0) {
    return NextResponse.json({ success: false, error: 'Invalid points' }, { status: 400 });
  }

  try {
    const result = await setOrderPoints(createServiceRoleClient(), {
      orderId,
      userId: authUser.id,
      points,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof PointsError) {
      return NextResponse.json(
        { success: false, error: error.code },
        { status: ERROR_STATUS[error.code] ?? 400 },
      );
    }
    console.error('[order-points] 포인트 적용 실패:', { orderId, error });
    return NextResponse.json({ success: false, error: 'Failed to apply points' }, { status: 500 });
  }
}
