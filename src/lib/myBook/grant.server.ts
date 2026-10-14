import { createServiceRoleClient } from '@/lib/supabase/admin';
import { generateOrderNumber } from '@/lib/payments/orderUtils';

/**
 * 결제가 확인된 나만의 악보집 주문의 곡들을 낱곡 구매내역에도 넣어 준다.
 * 결제용 주문(payment_order_id)이 완료돼 있으면 그 주문이 곧 구매내역이므로 연결만 한다.
 * 결제용 주문이 없는 경우(관리자 수동 확인 등)에만 0원 완료 주문(orders + order_items)을 만든다.
 * custom_orders.granted_order_id 로 한 번만 실행되도록 막는다.
 */
export async function grantMyBookSheets(customOrderId: string): Promise<void> {
  const service = createServiceRoleClient();

  const { data: customOrder, error } = await service
    .from('custom_orders')
    .select('id, user_id, order_type, granted_order_id, payment_order_id, book_title')
    .eq('id', customOrderId)
    .maybeSingle();

  if (error || !customOrder) {
    console.error('[my-book/grant] 주문 조회 실패:', { customOrderId, error });
    return;
  }
  if (customOrder.order_type !== 'book' || customOrder.granted_order_id || !customOrder.user_id) {
    return;
  }

  if (customOrder.payment_order_id) {
    const { data: paymentOrder } = await service
      .from('orders')
      .select('status')
      .eq('id', customOrder.payment_order_id)
      .maybeSingle();
    if (paymentOrder?.status === 'completed') {
      await service
        .from('custom_orders')
        .update({ granted_order_id: customOrder.payment_order_id })
        .eq('id', customOrderId)
        .is('granted_order_id', null);
      return;
    }
  }

  const { data: items, error: itemsError } = await service
    .from('custom_order_items')
    .select('drum_sheet_id, sheet_title')
    .eq('custom_order_id', customOrderId)
    .eq('is_owned', false)
    .not('drum_sheet_id', 'is', null)
    .order('position', { ascending: true });

  if (itemsError) {
    console.error('[my-book/grant] 곡 목록 조회 실패:', { customOrderId, itemsError });
    return;
  }
  if (!items || items.length === 0) return;

  const now = new Date().toISOString();
  const { data: order, error: orderError } = await service
    .from('orders')
    .insert({
      user_id: customOrder.user_id,
      order_number: generateOrderNumber(),
      total_amount: 0,
      points_used: 0,
      status: 'completed',
      payment_status: 'paid',
      payment_method: 'my_book',
      payment_provider: 'my_book',
      order_type: 'product',
      payment_confirmed_at: now,
      metadata: {
        type: 'my_book_grant',
        custom_order_id: customOrderId,
        book_title: customOrder.book_title,
      },
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('[my-book/grant] 구매내역 주문 생성 실패:', { customOrderId, orderError });
    return;
  }

  const discard = async () => {
    await service.from('order_items').delete().eq('order_id', order.id);
    await service.from('orders').delete().eq('id', order.id);
  };

  const { error: orderItemsError } = await service.from('order_items').insert(
    (items as Array<{ drum_sheet_id: string; sheet_title: string | null }>).map((item) => ({
      order_id: order.id,
      drum_sheet_id: item.drum_sheet_id,
      sheet_title: item.sheet_title || '제목 미등록',
      price: 0,
    }))
  );

  if (orderItemsError) {
    console.error('[my-book/grant] 구매내역 곡 저장 실패:', { customOrderId, orderItemsError });
    await discard();
    return;
  }

  // 동시에 두 번 실행된 경우 먼저 기록한 쪽만 남긴다
  const { data: linked } = await service
    .from('custom_orders')
    .update({ granted_order_id: order.id })
    .eq('id', customOrderId)
    .is('granted_order_id', null)
    .select('id')
    .maybeSingle();

  if (!linked) {
    await discard();
    return;
  }

  console.log('[my-book/grant] ✅ 낱곡 구매내역 추가:', { customOrderId, orderId: order.id, count: items.length });
}
