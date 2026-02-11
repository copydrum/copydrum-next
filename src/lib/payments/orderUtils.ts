import { supabase } from '../supabase';
import type { PaymentMethod, PaymentStatus } from './types';

export const generateOrderNumber = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `ORD${yyyy}${MM}${dd}${hh}${mm}${ss}${random}`;
};

interface CreatePendingOrderParams {
  userId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  description: string;
  paymentStatus?: PaymentStatus;
  metadata?: Record<string, unknown>;
  orderType?: 'product' | 'cash'; // 주문 타입 추가
  depositorName?: string; // 입금자명 추가
}

export const createPendingOrder = async ({
  userId,
  amount,
  paymentMethod,
  description: _description,
  paymentStatus = 'pending',
  metadata = {},
  orderType, // 주문 타입 추가
  depositorName, // 입금자명 추가
}: CreatePendingOrderParams) => {
  const orderNumber = generateOrderNumber();
  const normalizedAmount = Math.max(0, Math.round(amount));

  const { data, error } = await supabase
    .from('orders')
    .insert([
      {
        user_id: userId,
        order_number: orderNumber,
        total_amount: normalizedAmount,
        status: paymentStatus === 'awaiting_deposit' ? 'pending' : 'pending',
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        raw_status: paymentStatus,
        metadata,
        order_type: orderType, // 주문 타입 추가
        depositor_name: depositorName, // 입금자명 저장
      },
    ])
    .select('id, order_number')
    .single();

  if (error) {
    throw error;
  }

  return {
    orderId: data.id as string,
    orderNumber: data.order_number as string | null,
    amount: normalizedAmount,
  };
};

interface OrderItemInput {
  sheetId: string;
  price: number;
  title?: string | null;
}

interface CreateOrderWithItemsParams extends CreatePendingOrderParams {
  items: OrderItemInput[];
}

export const createOrderWithItems = async ({
  userId,
  amount,
  paymentMethod,
  description,
  items,
  paymentStatus = 'pending',
  metadata = {},
  orderType = 'product', // 주문 타입 추가 (기본값: product)
  depositorName, // 입금자명 추가
}: CreateOrderWithItemsParams) => {
  const { orderId, orderNumber } = await createPendingOrder({
    userId,
    amount,
    paymentMethod,
    description,
    paymentStatus,
    metadata: {
      ...metadata,
      itemCount: items.length,
    },
    orderType, // 주문 타입 추가
    depositorName, // 입금자명 전달
  });

  if (items.length > 0) {
    const orderItems = items.map((item) => ({
      order_id: orderId,
      drum_sheet_id: item.sheetId,
      sheet_title: item.title ?? '제목 미확인',
      price: Math.max(0, Math.round(item.price)),
    }));

    const { error: orderItemsError } = await supabase.from('order_items').insert(orderItems);

    if (orderItemsError) {
      await supabase.from('orders').delete().eq('id', orderId);
      throw orderItemsError;
    }
  }

  return {
    orderId,
    orderNumber,
    amount,
  };
};

