import { after } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { generateOrderNumber } from '@/lib/payments/orderUtils';
import { completeOrderAfterPayment } from '@/lib/payments/completeOrderAfterPayment';
import type { PaymentMethod } from '@/lib/payments/types';
import { releaseOrderPoints } from '@/lib/points/server';
import { allocateMyBookItemPrices } from './pricing';
import { grantMyBookSheets } from './grant.server';
import { buildMyBook } from './build.server';

/** orders.metadata.type: 나만의 악보집 결제용 주문 */
export const MY_BOOK_PAYMENT_ORDER_TYPE = 'my_book_payment';

export interface MyBookPaymentTarget {
  id: string;
  user_id: string | null;
  order_type: string | null;
  status: string;
  estimated_price: number | null;
  book_title: string | null;
  payment_order_id: string | null;
}

export interface MyBookPaymentOrder {
  id: string;
  status: string | null;
  payment_status: string | null;
  total_amount: number | null;
  points_used: number | null;
}

export interface MyBookPaymentInfo {
  method: PaymentMethod;
  transactionId: string;
  provider: string;
}

const TARGET_COLUMNS = 'id, user_id, order_type, status, estimated_price, book_title, payment_order_id';
const PAYMENT_ORDER_COLUMNS = 'id, status, payment_status, total_amount, points_used';

export async function loadMyBookPaymentTarget(
  service: SupabaseClient,
  customOrderId: string
): Promise<MyBookPaymentTarget | null> {
  const { data, error } = await service
    .from('custom_orders')
    .select(TARGET_COLUMNS)
    .eq('id', customOrderId)
    .maybeSingle<MyBookPaymentTarget>();
  if (error) throw error;
  return data;
}

async function loadPaymentOrder(service: SupabaseClient, orderId: string): Promise<MyBookPaymentOrder | null> {
  const { data } = await service
    .from('orders')
    .select(PAYMENT_ORDER_COLUMNS)
    .eq('id', orderId)
    .maybeSingle<MyBookPaymentOrder>();
  return data;
}

const isPaidOrder = (order: MyBookPaymentOrder) => order.status === 'completed' || order.payment_status === 'paid';

/**
 * 악보집 결제용 주문(orders)을 찾거나 만든다.
 * 담은 곡 중 아직 사지 않은 곡을 곡별 결제 금액과 함께 order_items 로 넣어, 결제가 끝나면 구매내역에 곡별로 남는다.
 */
export async function ensureMyBookPaymentOrder(
  service: SupabaseClient,
  book: MyBookPaymentTarget
): Promise<MyBookPaymentOrder> {
  const price = Math.round(Number(book.estimated_price) || 0);
  if (book.order_type !== 'book' || !book.user_id || price <= 0) {
    throw new Error('INVALID_BOOK_ORDER');
  }

  if (book.payment_order_id) {
    const existing = await loadPaymentOrder(service, book.payment_order_id);
    if (existing) {
      if (isPaidOrder(existing)) return existing;
      if (existing.status === 'pending' && Math.round(Number(existing.total_amount) || 0) === price) return existing;

      // 금액이 달라진 결제용 주문은 묶인 포인트를 돌려주고 새로 만든다
      if ((existing.points_used ?? 0) > 0) await releaseOrderPoints(service, existing.id);
      await service
        .from('orders')
        .update({ status: 'cancelled', payment_status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .eq('status', 'pending');
    }
  }

  const { data: items, error: itemsError } = await service
    .from('custom_order_items')
    .select('drum_sheet_id, sheet_title, list_price')
    .eq('custom_order_id', book.id)
    .eq('is_owned', false)
    .not('drum_sheet_id', 'is', null)
    .order('position', { ascending: true });
  if (itemsError) throw itemsError;

  const { data: created, error: createError } = await service
    .from('orders')
    .insert({
      user_id: book.user_id,
      order_number: generateOrderNumber(),
      total_amount: price,
      points_used: 0,
      status: 'pending',
      payment_status: 'pending',
      order_type: 'product',
      metadata: {
        type: MY_BOOK_PAYMENT_ORDER_TYPE,
        custom_order_id: book.id,
        book_title: book.book_title,
      },
    })
    .select(PAYMENT_ORDER_COLUMNS)
    .single<MyBookPaymentOrder>();
  if (createError || !created) throw createError ?? new Error('PAYMENT_ORDER_CREATE_FAILED');

  const discard = async () => {
    await service.from('order_items').delete().eq('order_id', created.id);
    await service.from('orders').delete().eq('id', created.id);
  };

  const rows = (items ?? []) as Array<{ drum_sheet_id: string; sheet_title: string | null; list_price: number | null }>;
  if (rows.length > 0) {
    const prices = allocateMyBookItemPrices(price, rows.map((row) => Number(row.list_price) || 0));
    const { error: orderItemsError } = await service.from('order_items').insert(
      rows.map((row, index) => ({
        order_id: created.id,
        drum_sheet_id: row.drum_sheet_id,
        sheet_title: row.sheet_title || '제목 미등록',
        price: prices[index],
      }))
    );
    if (orderItemsError) {
      await discard();
      throw orderItemsError;
    }
  }

  let link = service.from('custom_orders').update({ payment_order_id: created.id }).eq('id', book.id);
  link = book.payment_order_id ? link.eq('payment_order_id', book.payment_order_id) : link.is('payment_order_id', null);
  const { data: linked, error: linkError } = await link.select('id').maybeSingle();

  if (linkError || !linked) {
    // 동시에 다른 요청이 먼저 연결했다면 그 주문을 쓴다
    await discard();
    const latest = await loadMyBookPaymentTarget(service, book.id);
    const other = latest?.payment_order_id ? await loadPaymentOrder(service, latest.payment_order_id) : null;
    if (other) return other;
    throw linkError ?? new Error('PAYMENT_ORDER_LINK_FAILED');
  }

  return created;
}

/**
 * 결제가 끝난 악보집의 결제용 주문을 완료 처리하고 낱곡 구매내역으로 연결한다.
 * 여러 번 불러도 한 번만 처리된다.
 */
export async function completeMyBookPaymentOrder(
  service: SupabaseClient,
  customOrderId: string,
  payment: MyBookPaymentInfo
): Promise<void> {
  const book = await loadMyBookPaymentTarget(service, customOrderId);
  if (!book || book.order_type !== 'book') return;

  const order = await ensureMyBookPaymentOrder(service, book);
  if (!isPaidOrder(order)) {
    await completeOrderAfterPayment(
      order.id,
      payment.method,
      {
        transactionId: payment.transactionId,
        paymentProvider: payment.provider,
        metadata: { custom_order_id: customOrderId },
      },
      service
    );
  }

  await service
    .from('custom_orders')
    .update({ granted_order_id: order.id })
    .eq('id', customOrderId)
    .is('granted_order_id', null);
}

/**
 * 결제 확인 직후 처리: 결제용 주문 완료 → 낱곡 구매내역 → 응답을 보낸 뒤 악보집 PDF 자동 제작.
 * 어느 단계가 실패해도 결제 확인 응답은 막지 않는다.
 */
export async function fulfillMyBookAfterPayment(customOrderId: string, payment?: MyBookPaymentInfo): Promise<void> {
  if (payment) {
    try {
      await completeMyBookPaymentOrder(createServiceRoleClient(), customOrderId, payment);
    } catch (error) {
      console.error('[my-book/payment] 결제용 주문 완료 처리 실패:', { customOrderId, error });
    }
  }

  try {
    await grantMyBookSheets(customOrderId);
  } catch (error) {
    console.error('[my-book/payment] 낱곡 구매내역 추가 실패:', { customOrderId, error });
  }

  after(async () => {
    try {
      await buildMyBook(customOrderId);
    } catch (error) {
      console.error('[my-book/payment] 악보집 자동 제작 실패:', { customOrderId, error });
    }
  });
}
