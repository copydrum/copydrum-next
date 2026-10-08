import { supabase } from '@/lib/supabase';

interface EnsureCheckoutOrderParams {
  orderId: string;
  userId: string;
  amount: number;
  paymentMethod: string;
  items: { sheet_id: string; title: string; price: number }[];
}

/**
 * 결제 화면의 orderId 가 DB 에 없으면(장바구니에서 바로 결제 등) 서버에 주문을 만든다.
 * amount 는 포인트 차감 전 주문 총액이어야 한다 (서버 가격 검증 기준).
 */
export async function ensureCheckoutOrder({
  orderId,
  userId,
  amount,
  paymentMethod,
  items,
}: EnsureCheckoutOrderParams): Promise<{ orderId: string; alreadyPaid: boolean }> {
  try {
    const { data } = await supabase.from('orders').select('id').eq('id', orderId).maybeSingle();
    if (data) return { orderId, alreadyPaid: false };
  } catch {
    // orderId 가 UUID 가 아니면 조회 에러 → 새 주문 생성
  }

  const description =
    items.length === 1 ? items[0].title : `${items[0].title} 외 ${items.length - 1}건`;

  const response = await fetch('/api/orders/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      items: items.map((item) => ({ sheetId: item.sheet_id, title: item.title, price: item.price })),
      amount,
      description,
      paymentMethod,
    }),
  });
  const result = await response.json();

  if (!result.success || !result.orderId) {
    throw new Error(result.error || '주문 생성에 실패했습니다.');
  }

  return { orderId: result.orderId, alreadyPaid: !!result.alreadyPaid };
}
