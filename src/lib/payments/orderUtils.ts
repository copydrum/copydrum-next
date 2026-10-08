import type { PaymentMethod } from './types';

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

interface OrderItemInput {
  sheetId: string;
  price: number;
  title?: string | null;
}

interface CreateOrderWithItemsParams {
  userId: string;
  amount: number;
  paymentMethod: PaymentMethod | string;
  description: string;
  items: OrderItemInput[];
}

/**
 * 악보 주문 생성. 가격 검증과 주문 저장은 서버(/api/orders/create)가 처리한다.
 * 생성된 주문은 payment_status = 'pending' 이며, 무통장 입금 표시는 호출부에서 갱신한다.
 */
export const createOrderWithItems = async ({
  userId,
  amount,
  paymentMethod,
  description,
  items,
}: CreateOrderWithItemsParams) => {
  const normalizedAmount = Math.max(0, Math.round(amount));

  const response = await fetch('/api/orders/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      amount: normalizedAmount,
      description,
      paymentMethod,
      items: items.map((item) => ({
        sheetId: item.sheetId,
        title: item.title ?? '제목 미확인',
        price: Math.max(0, Math.round(item.price)),
      })),
    }),
  });

  const result = await response.json().catch(() => null);

  if (!result?.success || !result.orderId) {
    throw new Error(result?.error || '주문 생성에 실패했습니다.');
  }

  if (result.alreadyPaid) {
    throw new Error('이미 결제가 완료된 주문입니다. 구매내역을 확인해 주세요.');
  }

  return {
    orderId: result.orderId as string,
    orderNumber: (result.orderNumber as string | null) ?? null,
    amount: normalizedAmount,
  };
};
