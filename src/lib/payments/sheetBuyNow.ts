import type { User } from '@supabase/supabase-js';
import { getSiteCurrency } from '../currency';
import { startSheetPurchase } from './productPurchase';
import type { VirtualAccountInfo } from './types';

export interface SheetBuyNowResult {
  orderId: string;
  orderNumber: string | null;
  amount: number;
  paymentMethod: 'bank_transfer' | 'paypal';
  virtualAccountInfo?: VirtualAccountInfo | null;
}

export interface SheetBuyNowParams {
  user: User;
  sheet: {
    id: string;
    title: string;
    price: number;
  };
  depositorName?: string;
  elementId?: string; // PayPal SPB 렌더링을 위한 컨테이너 ID
  description?: string;
}

/**
 * 단일 악보 바로구매 함수
 * 사이트 설정(통화)에 따라 자동으로 결제 방식을 선택합니다.
 * - 한국 사이트 (KRW): 무통장 입금
 * - 글로벌 사이트 (USD/기타): PayPal
 */
export async function buySheetNow({
  user,
  sheet,
  depositorName,
  elementId,
  description,
}: SheetBuyNowParams): Promise<SheetBuyNowResult> {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'copydrum.com';
  const currency = getSiteCurrency(hostname);
  const paymentMethods: ('bank' | 'paypal')[] = currency === 'KRW' ? ['bank'] : ['paypal'];

  // 한국 사이트: 무통장 입금
  if (currency === 'KRW' && paymentMethods.includes('bank')) {
    const result = await startSheetPurchase({
      userId: user.id,
      items: [{ sheetId: sheet.id, sheetTitle: sheet.title, price: sheet.price }],
      amount: sheet.price,
      paymentMethod: 'bank_transfer',
      description: description || `악보 구매: ${sheet.title}`,
      buyerName: user.email ?? null,
      buyerEmail: user.email ?? null,
      depositorName,
    });

    return {
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      amount: result.amount,
      paymentMethod: 'bank_transfer',
      virtualAccountInfo: result.virtualAccountInfo,
    };
  }

  // 글로벌 사이트: PayPal
  // PayPal의 경우 elementId가 필요하므로, 주문 생성은 모달의 handlePayPalInitiate에서 처리
  // 여기서는 PayPal임을 알리는 정보만 반환
  if (currency !== 'KRW' && paymentMethods.includes('paypal')) {
    // 주문 생성은 모달에서 handlePayPalInitiate를 통해 처리
    // 여기서는 주문을 생성하지 않고 모달을 열도록 함
    return {
      orderId: '',
      orderNumber: null,
      amount: sheet.price,
      paymentMethod: 'paypal' as const,
    };
  }

  console.error('[buySheetNow] No valid payment method for current site', {
    currency,
    paymentMethods,
  });
  throw new Error('지원하지 않는 결제 환경입니다.');
}

