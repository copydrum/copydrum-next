import { NextRequest, NextResponse, after } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth/requireUser';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import {
  buildMyBook,
  isMyBookBuildStale,
  MY_BOOK_DELAY_REPORT_MARK as DELAY_REPORT_MARK,
  MY_BOOK_PAID_STATUSES,
} from '@/lib/myBook/build.server';
import { sendMyBookBuildFailedNotification } from '@/lib/email/sendMyBookBuildFailedNotification';

export const maxDuration = 300;

/** 고객 화면의 MyBookBuildStatus DELAYED_AFTER_MS 와 맞춘다 */
const DELAY_REPORT_MINUTES = 10;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 실패한 제작을 고객이 다시 시도할 때 최소 간격 */
const RETRY_COOLDOWN_MS = 60 * 1000;

/**
 * 고객 주문 상세에서 호출한다. 결제 후 자동 제작이 시작되지 않았거나 중간에 멈춘 경우 다시 시작한다.
 * 실제 제작은 응답 후 진행되고, 화면은 custom_orders.book_build_status 를 다시 읽어 확인한다.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    customOrderId?: string;
    retry?: boolean;
    reportDelay?: boolean;
  };
  const customOrderId = String(body.customOrderId ?? '').trim();
  if (!UUID_RE.test(customOrderId)) {
    return NextResponse.json({ success: false, error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const service = createServiceRoleClient();
  const { data: order } = await service
    .from('custom_orders')
    .select(
      'id, user_id, order_type, status, name, email, book_title, completed_pdf_url, book_build_status, book_build_started_at, book_build_error'
    )
    .eq('id', customOrderId)
    .maybeSingle();

  if (!order || order.user_id !== user.id || order.order_type !== 'book') {
    return NextResponse.json({ success: false, error: '주문을 찾을 수 없습니다.' }, { status: 404 });
  }
  if (!MY_BOOK_PAID_STATUSES.includes(order.status)) {
    return NextResponse.json({ success: false, error: '결제가 확인된 주문이 아닙니다.' }, { status: 400 });
  }
  if (order.book_build_status === 'done' || order.completed_pdf_url) {
    return NextResponse.json({ success: true, buildStatus: 'done' });
  }
  if (body.reportDelay) {
    // 실패로 끝나면 build.server 가 이미 알림을 보냈으므로, 끝나지 않고 멈춘 경우만 알린다
    const alreadyReported = order.book_build_error?.startsWith(DELAY_REPORT_MARK);
    if (order.book_build_status !== 'failed' && !alreadyReported) {
      // 새 제작 시도가 시작되면 book_build_error 가 비워지므로 시도마다 한 번만 보낸다
      const { data: marked } = await service
        .from('custom_orders')
        .update({ book_build_error: `${DELAY_REPORT_MARK} ${new Date().toISOString()} 고객 화면에서 지연 알림 발송` })
        .eq('id', customOrderId)
        .is('completed_pdf_url', null)
        .or(`book_build_error.is.null,book_build_error.not.like."${DELAY_REPORT_MARK}*"`)
        .select('id')
        .maybeSingle();
      if (!marked) {
        return NextResponse.json({ success: true, buildStatus: order.book_build_status ?? 'pending' });
      }
      const { count } = await service
        .from('custom_order_items')
        .select('id', { count: 'exact', head: true })
        .eq('custom_order_id', customOrderId);
      await sendMyBookBuildFailedNotification({
        customOrderId,
        bookTitle: order.book_title?.trim() || '나만의 악보집',
        buyerName: order.name?.trim() || order.email?.split('@')[0] || '고객',
        buyerEmail: order.email,
        songCount: count ?? 0,
        error: `고객 화면에서 ${DELAY_REPORT_MINUTES}분이 지나도록 자동 제작이 끝나지 않음 (상태: ${order.book_build_status ?? '시작 안 됨'}${order.book_build_error ? `, 마지막 오류: ${order.book_build_error}` : ''})`,
      });
    }
    return NextResponse.json({ success: true, buildStatus: order.book_build_status ?? 'pending' });
  }
  if (order.book_build_status === 'building' && !isMyBookBuildStale(order)) {
    return NextResponse.json({ success: true, buildStatus: 'building' });
  }
  if (order.book_build_status === 'failed') {
    const lastStarted = order.book_build_started_at ? new Date(order.book_build_started_at).getTime() : 0;
    if (!body.retry || Date.now() - lastStarted < RETRY_COOLDOWN_MS) {
      return NextResponse.json({ success: true, buildStatus: 'failed' });
    }
  }

  after(async () => {
    try {
      await buildMyBook(customOrderId);
    } catch (error) {
      console.error('[my-book/build] 악보집 제작 실패:', { customOrderId, error });
    }
  });
  return NextResponse.json({ success: true, buildStatus: 'building' });
}
