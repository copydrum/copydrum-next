export type CashPurchaseItem = {
  sheetId: string;
  sheetTitle?: string | null;
  price: number | null | undefined;
};

export type ProcessCashPurchaseResult =
  | {
      success: true;
      newCredits: number;
      orderId: string | null;
    }
  | {
      success: false;
      reason: 'INSUFFICIENT_CREDIT';
      currentCredits: number;
    };

export interface ProcessCashPurchaseParams {
  userId: string;
  totalPrice: number;
  description: string;
  items?: CashPurchaseItem[];
  sheetIdForTransaction?: string | null;
  paymentMethod?: string;
}

/**
 * 보유 캐쉬로 악보를 구매한다. 차감·주문 생성은 서버(/api/payments/cash/purchase)가 처리한다.
 * userId 는 호출부 호환용이며, 서버는 로그인 세션의 사용자만 신뢰한다.
 */
export const processCashPurchase = async ({
  totalPrice,
  description,
  items = [],
  sheetIdForTransaction = null,
}: ProcessCashPurchaseParams): Promise<ProcessCashPurchaseResult> => {
  const response = await fetch('/api/payments/cash/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      totalPrice,
      description,
      sheetIdForTransaction,
      items: items.map((item) => ({
        sheetId: item.sheetId,
        sheetTitle: item.sheetTitle ?? null,
        price: Math.max(0, Math.round(item.price ?? 0)),
      })),
    }),
  });

  const result = await response.json().catch(() => null);

  if (result?.success) {
    return { success: true, newCredits: Number(result.newCredits) || 0, orderId: result.orderId ?? null };
  }

  if (result?.reason === 'INSUFFICIENT_CREDIT') {
    return { success: false, reason: 'INSUFFICIENT_CREDIT', currentCredits: Number(result.currentCredits) || 0 };
  }

  throw new Error(result?.error || '캐쉬 결제 처리 중 오류가 발생했습니다.');
};
