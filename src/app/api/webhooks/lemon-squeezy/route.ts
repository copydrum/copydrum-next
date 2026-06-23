import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { completeOrderAfterPayment } from '@/lib/payments/completeOrderAfterPayment';
import { LEMON_SQUEEZY_METHOD } from '@/lib/payments/lemonSqueezy';

// 웹훅은 원문(raw body)으로 서명을 검증해야 하므로 Edge가 아닌 Node 런타임 사용
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  console.warn('[ls-webhook] ⚠️ Service Role Key 없음 → Anon Key 사용 (RLS 적용됨)');
  return createClient(url, anonKey);
}

/**
 * Lemon Squeezy 서명 검증
 * 문서: https://docs.lemonsqueezy.com/guides/developer-guide/webhooks#signing-requests
 *   X-Signature 헤더 = HMAC-SHA256(raw body, webhook_secret) 의 hex 문자열
 */
function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  try {
    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from(hmac.update(rawBody, 'utf8').digest('hex'), 'utf8');
    const received = Buffer.from(signature, 'utf8');
    if (digest.length !== received.length) return false;
    return crypto.timingSafeEqual(digest, received);
  } catch (e) {
    console.error('[ls-webhook] 서명 검증 중 예외:', e);
    return false;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error('[ls-webhook] ❌ LEMON_SQUEEZY_WEBHOOK_SECRET 미설정');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  // 1) 원문 읽기 + 서명 검증
  const rawBody = await request.text();
  const signature = request.headers.get('x-signature');

  if (!verifySignature(rawBody, signature, secret)) {
    console.warn('[ls-webhook] ⛔ 서명 불일치 — 요청 거부');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventName: string =
    request.headers.get('x-event-name') || payload?.meta?.event_name || '';
  const customData = payload?.meta?.custom_data || {};
  const orderId: string | undefined = customData.order_id;

  // LS 주문 식별자 (멱등/추적용)
  const lsOrderId = payload?.data?.id ? `ls_${payload.data.id}` : undefined;
  const lsStatus: string = payload?.data?.attributes?.status || '';

  console.log('[ls-webhook] 📩 수신:', { eventName, orderId, lsOrderId, lsStatus });

  // 결제 완료 이벤트만 처리한다. (order_created + status paid)
  // 그 외 이벤트(refunded 등)는 200으로 받아 LS 재전송을 막되 동작은 하지 않음.
  if (eventName !== 'order_created') {
    console.log('[ls-webhook] ℹ️ 처리 대상 외 이벤트 — 무시:', eventName);
    return NextResponse.json({ received: true, ignored: eventName });
  }

  if (lsStatus && lsStatus !== 'paid') {
    console.log('[ls-webhook] ℹ️ 결제 완료 상태 아님 — 무시:', lsStatus);
    return NextResponse.json({ received: true, status: lsStatus });
  }

  if (!orderId) {
    console.error('[ls-webhook] ❌ custom_data.order_id 없음 — 주문 매칭 불가:', customData);
    // 200으로 응답해 무한 재전송을 막되, 매칭 실패는 로그로 남긴다.
    return NextResponse.json({ received: true, error: 'missing order_id' });
  }

  try {
    const supabase = createAdminClient();

    // 주문 존재/소유 확인 (custom_data 위조 대비: user_id 일치 확인)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, status, payment_status')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError || !order) {
      console.error('[ls-webhook] ❌ 주문을 찾을 수 없음:', { orderId, orderError });
      return NextResponse.json({ received: true, error: 'order not found' });
    }

    if (customData.user_id && String(order.user_id) !== String(customData.user_id)) {
      console.error('[ls-webhook] ⛔ user_id 불일치 — 처리 중단:', {
        orderUserId: order.user_id,
        customUserId: customData.user_id,
      });
      return NextResponse.json({ received: true, error: 'user mismatch' });
    }

    // 멱등: 이미 완료된 주문이면 그대로 통과 (completeOrderAfterPayment가 내부에서도 한 번 더 가드)
    if (order.status === 'completed' || order.payment_status === 'paid') {
      console.log('[ls-webhook] ✅ 이미 완료된 주문(멱등):', orderId);
      return NextResponse.json({ received: true, alreadyCompleted: true });
    }

    // 주문 완료 처리: 상태 paid/completed + purchases 기록(다운로드 권한 부여)
    await completeOrderAfterPayment(
      orderId,
      LEMON_SQUEEZY_METHOD as any,
      {
        transactionId: lsOrderId,
        paymentConfirmedAt: new Date().toISOString(),
        paymentProvider: 'lemonsqueezy',
        rawResponse: payload?.data?.attributes
          ? {
              ls_order_id: payload.data.id,
              total: payload.data.attributes.total,
              currency: payload.data.attributes.currency,
              status: lsStatus,
            }
          : undefined,
      },
      supabase,
    );

    console.log('[ls-webhook] ✅ 주문 완료 처리 성공:', { orderId, lsOrderId });
    return NextResponse.json({ received: true, completed: true });
  } catch (error) {
    console.error('[ls-webhook] 🔥 처리 중 예외:', error);
    // 500을 반환하면 LS가 재전송하므로, 일시적 오류 복구 기회를 준다.
    return NextResponse.json(
      { received: false, error: error instanceof Error ? error.message : 'unknown' },
      { status: 500 },
    );
  }
}
