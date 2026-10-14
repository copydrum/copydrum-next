import { NextRequest, NextResponse, after } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { grantMyBookSheets } from '@/lib/myBook/grant.server';
import { buildMyBook } from '@/lib/myBook/build.server';

export const maxDuration = 300;

const PAID_STATUSES = ['payment_confirmed', 'in_progress', 'completed'];

/**
 * 관리자가 나만의 악보집 주문을 결제 확인(무통장 입금 등) 상태로 바꿨을 때
 * 담은 곡을 낱곡 구매내역에 넣고, 아직 완성 파일이 없으면 악보집 PDF 를 자동으로 만든다.
 * 이미 넣었거나 만들었으면 아무것도 하지 않는다.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: profile } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const { customOrderId } = (await request.json().catch(() => ({}))) as { customOrderId?: string };
  if (!customOrderId) {
    return NextResponse.json({ success: false, error: 'customOrderId required' }, { status: 400 });
  }

  const { data: order } = await service
    .from('custom_orders')
    .select('status, order_type')
    .eq('id', customOrderId)
    .maybeSingle();
  if (!order || order.order_type !== 'book' || !PAID_STATUSES.includes(order.status)) {
    return NextResponse.json({ success: true, skipped: true });
  }

  await grantMyBookSheets(customOrderId);
  after(async () => {
    try {
      await buildMyBook(customOrderId);
    } catch (error) {
      console.error('[admin/my-book/grant] 악보집 자동 제작 실패:', { customOrderId, error });
    }
  });
  return NextResponse.json({ success: true });
}
