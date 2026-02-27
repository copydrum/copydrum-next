import { supabase } from './supabase';
import { generateOrderNumber } from './payments/orderUtils';
import { calculateExpectedCompletionDate, formatDateToYMD } from '@/utils/businessDays';

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

const normalizeAmount = (value: number | null | undefined) => {
  if (!value || Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
};

export const processCashPurchase = async ({
  userId,
  totalPrice,
  description,
  items = [],
  sheetIdForTransaction = null,
  paymentMethod = 'cash',
}: ProcessCashPurchaseParams): Promise<ProcessCashPurchaseResult> => {
  const normalizedTotal = normalizeAmount(totalPrice);

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  const currentCredits = profile?.credits ?? 0;

  if (normalizedTotal > currentCredits) {
    return {
      success: false,
      reason: 'INSUFFICIENT_CREDIT',
      currentCredits,
    };
  }

  const shouldDeductCredits = normalizedTotal > 0;
  const newCredits = shouldDeductCredits ? currentCredits - normalizedTotal : currentCredits;

  if (shouldDeductCredits) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: newCredits })
      .eq('id', userId);

    if (updateError) {
      throw updateError;
    }
  }

  let orderId: string | null = null;
  let orderNumber = '';

  try {
    orderNumber = generateOrderNumber();
    const paymentConfirmedAt = new Date().toISOString();

    // 선주문 상품 확인 및 예상 완료일 계산
    let expectedCompletionDateStr: string | null = null;
    if (items.length > 0) {
      const sheetIds = items.map((item) => item.sheetId).filter(Boolean);
      if (sheetIds.length > 0) {
        const { data: sheets, error: sheetsError } = await supabase
          .from('drum_sheets')
          .select('id, sales_type')
          .in('id', sheetIds);

        if (!sheetsError && sheets) {
          const hasPreorderItems = sheets.some((sheet) => sheet.sales_type === 'PREORDER');
          if (hasPreorderItems) {
            const expectedCompletionDate = calculateExpectedCompletionDate(paymentConfirmedAt);
            expectedCompletionDateStr = formatDateToYMD(expectedCompletionDate);
            console.log('[processCashPurchase] ✅ 선주문 예상 완료일 계산 완료:', {
              expectedCompletionDate: expectedCompletionDateStr,
              paymentDate: paymentConfirmedAt,
              preorderSheetCount: sheets.filter((s) => s.sales_type === 'PREORDER').length,
            });
          }
        } else if (sheetsError) {
          console.warn('[processCashPurchase] 상품 정보 조회 실패 (예상 완료일 계산 건너뜀):', sheetsError);
        }
      }
    }

    const orderInsertPayload: Record<string, unknown> = {
      user_id: userId,
      order_number: orderNumber,
      total_amount: normalizedTotal,
      status: 'completed',
      payment_status: 'paid',
      payment_confirmed_at: paymentConfirmedAt,
      payment_method: paymentMethod,
      order_type: 'product',
    };

    // 예상 완료일이 계산된 경우 추가
    if (expectedCompletionDateStr) {
      orderInsertPayload.expected_completion_date = expectedCompletionDateStr;
      console.log('[processCashPurchase] 📅 저장할 예상 완료일:', expectedCompletionDateStr);
    }

    const { data: orderInsertData, error: orderInsertError } = await supabase
      .from('orders')
      .insert([orderInsertPayload])
      .select('id')
      .single();

    if (orderInsertError) {
      throw orderInsertError;
    }

    orderId = orderInsertData?.id ?? null;

    if (items.length > 0 && orderId) {
      console.log('[debug] 📦 processCashPurchase → orderId:', orderId);
      console.log('[debug] 🧾 processCashPurchase → items:', items);

      const orderItemsPayload = items.map((item) => ({
        order_id: orderId,
        drum_sheet_id: item.sheetId,
        sheet_title: item.sheetTitle ?? '제목 미등록',
        price: normalizeAmount(item.price),
      }));

      console.log('[debug] 🧩 processCashPurchase → orderItemsPayload:', orderItemsPayload);

      const { data: orderItemsData, error: orderItemsError } = await supabase
        .from('order_items')
        .insert(orderItemsPayload)
        .select('id, order_id, drum_sheet_id, price');
      if (orderItemsError) {
        console.error('[error] ❌ processCashPurchase → order_items insert failed:', orderItemsError);
        throw orderItemsError;
      }

      console.log('[debug] ✅ processCashPurchase → order_items insert success:', orderItemsData);
    }

    if (shouldDeductCredits) {
      const inferredSheetId =
        sheetIdForTransaction !== null
          ? sheetIdForTransaction
          : items.length === 1
          ? items[0].sheetId
          : null;

      const { error: transactionError } = await supabase.from('cash_transactions').insert([
        {
          user_id: userId,
          transaction_type: 'use',
          amount: -normalizedTotal,
          bonus_amount: 0,
          balance_after: newCredits,
          description,
          sheet_id: inferredSheetId,
          order_id: orderId,
          created_by: userId,
        },
      ]);

      if (transactionError) {
        throw transactionError;
      }
    }

    return {
      success: true,
      newCredits,
      orderId,
    };
  } catch (error) {
    if (shouldDeductCredits) {
      try {
        await supabase.from('profiles').update({ credits: currentCredits }).eq('id', userId);
      } catch (rollbackError) {
        console.error('캐쉬 차감 롤백 실패:', rollbackError);
      }
    }

    if (orderId) {
      try {
        await supabase.from('order_items').delete().eq('order_id', orderId);
        await supabase.from('orders').delete().eq('id', orderId);
      } catch (rollbackError) {
        console.error('주문 롤백 실패:', rollbackError);
      }
    }

    throw error;
  }
};

